import { finalizeAnswer } from '@/lib/assistant-format'
import { gatherSources } from '@/lib/assistant-sources'
import { getMessages, getOwnedPortfolioView } from '@/lib/data'
import { streamChatReply } from '@/lib/gemini'
import { getMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

// Streams the assistant's answer while it is being written. When the model
// has finished, the answer is tidied (citations checked against the sources
// it was actually given, the sources list appended), sent once more in its
// final form, and stored with the question in `messages`.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Sent as the last character when the answer broke off, so the page can say so. */
const FAILED = '\u0000'

/** Sent before the final, tidied answer: the page shows what follows instead of the draft. */
const FINAL = '\u0001'

function json(error: string, status: number) {
  return Response.json({ error }, { status })
}

export async function POST(request: Request) {
  // Only accept calls made by this site's own pages.
  const origin = request.headers.get('origin')
  if (origin && new URL(origin).host !== request.headers.get('host')) {
    return json('Forbidden', 403)
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json('Your session has expired. Log in again.', 401)

  let body: { portfolioId?: unknown; question?: unknown }
  try {
    body = await request.json()
  } catch {
    return json('Bad request.', 400)
  }

  const portfolioId = typeof body.portfolioId === 'string' ? body.portfolioId : ''
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question) return json('Type a question first.', 400)
  if (question.length > 2000) return json('Keep the question under 2,000 characters.', 400)

  const view = await getOwnedPortfolioView(supabase, portfolioId)
  // The conversation belongs to the owner; people it is shared with don't get one.
  if (!view || view.portfolio.user_id !== user.id) return json('Portfolio not found.', 404)

  const [history, sources, money] = await Promise.all([
    getMessages(supabase, view.portfolio.id),
    gatherSources(view),
    getMoney(),
  ])
  // Figures go to the assistant in the currency the page shows, so its answer matches it.
  const reply = await streamChatReply(view, history, question, sources, money)
  if (!reply.ok) return json(reply.error, 503)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let answer = ''
      let failed = false
      try {
        for await (const chunk of reply.chunks) {
          answer += chunk
          controller.enqueue(encoder.encode(chunk))
        }
      } catch {
        failed = true
      }

      // Only sources the model was given can be cited; the list is written here, not by it.
      answer = failed ? '' : finalizeAnswer(answer, sources)
      if (!failed && answer) {
        controller.enqueue(encoder.encode(FINAL + answer))
        // Nothing is stored unless the answer completed, so a failed attempt
        // doesn't leave a question hanging in the conversation.
        const now = Date.now()
        const { error } = await supabase.from('messages').insert([
          {
            portfolio_id: view.portfolio.id,
            role: 'user',
            content: question,
            created_at: new Date(now).toISOString(),
          },
          {
            portfolio_id: view.portfolio.id,
            role: 'assistant',
            content: answer,
            created_at: new Date(now + 1).toISOString(),
          },
        ])
        if (error) failed = true
      } else {
        failed = true
      }

      if (failed) controller.enqueue(encoder.encode(FAILED))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      // Ask proxies not to hold the answer back until it is complete.
      'x-accel-buffering': 'no',
    },
  })
}
