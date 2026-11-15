import { after } from 'next/server'
import { finalizeAnswer } from '@/lib/assistant-format'
import { attachAction, stripMarkers } from '@/lib/chat-actions'
import { RECORD_CHANGE, proposalFrom } from '@/lib/chat-proposal'
import { marketDate } from '@/lib/format'
import { gatherSources } from '@/lib/assistant-sources'
import { EARLIER_CHAT, getChats, getOwnedPortfolioView, isUuid } from '@/lib/data'
import { streamChatReply } from '@/lib/gemini'
import { getMoney } from '@/lib/money'
import { createClient } from '@/lib/supabase/server'

// Streams the assistant's answer while it is being written. When the model
// has finished, the answer is tidied (citations checked against the sources
// it was actually given, the sources list appended), sent once more in its
// final form, and stored with the question in `messages`. Leaving the page
// doesn't stop it: the answer is still finished and saved.

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

  let body: { portfolioId?: unknown; question?: unknown; chatId?: unknown }
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

  // Which chat this question belongs to. A new id starts a new chat; the
  // assistant is only shown what was said earlier in the same one.
  const requested = typeof body.chatId === 'string' ? body.chatId : ''
  if (requested && requested !== EARLIER_CHAT && !isUuid(requested)) return json('Bad request.', 400)

  // The display currency was already looked up for the view (getMoney is cached per request).
  const money = await getMoney()
  const [{ available, chats }, sources] = await Promise.all([
    getChats(supabase, view.portfolio.id),
    gatherSources(view, money),
  ])
  // Without the chat_id column there is one conversation, whatever was asked for.
  const chatId = available ? requested || EARLIER_CHAT : EARLIER_CHAT
  const history = chats.find((c) => c.id === chatId)?.messages ?? []
  const stamp = available ? { chat_id: chatId === EARLIER_CHAT ? null : chatId } : {}
  // Figures go to the assistant in the currency the page shows, so its answer matches it.
  const reply = await streamChatReply(view, history, question, sources, money)
  if (!reply.ok) return json(reply.error, 503)

  // The answer is written to the end and saved even if the page that asked
  // goes away (another page, a reload, a closed tab). Whoever is still
  // listening gets it as it is written; nobody listening is fine too.
  const encoder = new TextEncoder()
  let listening = true
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      listening = false
    },
  })
  function send(text: string) {
    if (!listening || !controller) return
    try {
      controller.enqueue(encoder.encode(text))
    } catch {
      listening = false
    }
  }
  function end() {
    if (!listening || !controller) return
    listening = false
    try {
      controller.close()
    } catch {
      // already closed by the other side
    }
  }

  const work = (async () => {
    let answer = ''
    let failed = false
    try {
      for await (const chunk of reply.chunks) {
        // The model's text can never carry one of the app's own markers.
        const clean = stripMarkers(chunk)
        answer += clean
        send(clean)
      }
    } catch {
      failed = true
    }

    // A change the owner asked for, set up for them to confirm (never made here).
    const call = failed ? undefined : reply.calls.find((c) => c.name === RECORD_CHANGE.name)
    const proposal = call ? proposalFrom(call.args, view.holdings, marketDate()) : { action: null, note: null }
    let text = stripMarkers(answer).trim()
    if (proposal.note) text = text ? `${text}\n\n${proposal.note}` : proposal.note
    if (proposal.action && !text) {
      text = 'Here are the details to record. Check them, fill in anything missing, and confirm.'
    }

    // Only sources the model was given can be cited; the list is written here, not by it.
    answer = failed || !text ? '' : finalizeAnswer(text, sources)
    if (answer && proposal.action) answer = attachAction(answer, proposal.action)
    if (!failed && answer) {
      send(FINAL + answer)
      // Nothing is stored unless the answer completed, so a failed attempt
      // doesn't leave a question hanging in the conversation.
      const now = Date.now()
      const { error } = await supabase.from('messages').insert([
        {
          portfolio_id: view.portfolio.id,
          role: 'user',
          content: question,
          created_at: new Date(now).toISOString(),
          ...stamp,
        },
        {
          portfolio_id: view.portfolio.id,
          role: 'assistant',
          content: answer,
          created_at: new Date(now + 1).toISOString(),
          ...stamp,
        },
      ])
      if (error) failed = true
    } else {
      failed = true
    }

    if (failed) send(FAILED)
    end()
  })()
  // Keeps the function running after the response has gone (or been dropped)
  // until the answer is saved.
  after(() => work)

  return new Response(stream, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      // Ask proxies not to hold the answer back until it is complete.
      'x-accel-buffering': 'no',
    },
  })
}
