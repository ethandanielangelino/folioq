import { timingSafeEqual } from 'node:crypto'
import { savePrices } from '@/lib/data'
import { getAssetQuotes } from '@/lib/asset-prices'
import { toAssetClass } from '@/lib/assets'
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

  // Every column, so this works whether or not supabase/assets.sql has added asset_class.
  const { data, error } = await admin.from('holdings').select('*')
  if (error) {
    return Response.json({ error: 'Could not read holdings' }, { status: 500 })
  }

  const items = (data ?? []).map((row) => ({
    ticker: String(row.ticker),
    assetClass: toAssetClass(row.asset_class),
  }))
  // Crypto, gold, and cash have no closing bell: the price at the time this
  // runs is filed as that day's close, the same day the stocks' close is.
  const quotes = await getAssetQuotes(items)
  const wanted = Object.keys(quotes).length
  const saved = await savePrices(quotes)

  return Response.json({ prices: wanted, saved, missing: wanted - saved })
}
