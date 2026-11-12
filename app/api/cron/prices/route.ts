import { timingSafeEqual } from 'node:crypto'
import { savePrices } from '@/lib/data'
import { getQuotes } from '@/lib/finnhub'
import { createAdminClient } from '@/lib/supabase/admin'

// Nightly job: stores the closing price of every held ticker in `prices`, so
// each portfolio's value-over-time chart has history. Scheduled in
// vercel.json; Vercel sends "Authorization: Bearer <CRON_SECRET>" itself.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // never accept "Bearer undefined"

  const expected = Buffer.from(`Bearer ${secret}`)
  const received = Buffer.from(request.headers.get('authorization') ?? '')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return Response.json({ error: 'Service role key is not configured' }, { status: 500 })
  }

  const { data, error } = await admin.from('holdings').select('ticker')
  if (error) {
    return Response.json({ error: 'Could not read holdings' }, { status: 500 })
  }

  const tickers = [...new Set((data ?? []).map((row) => row.ticker as string))]
  const quotes = await getQuotes(tickers)
  const saved = await savePrices(quotes)

  return Response.json({ tickers: tickers.length, saved, missing: tickers.length - saved })
}
