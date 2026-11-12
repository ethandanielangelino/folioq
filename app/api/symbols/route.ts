import { searchSymbols } from '@/lib/finnhub'

// Ticker suggestions for the public Research search box.
// Finnhub answers are cached for an hour per query, and browsers may reuse a
// response for five minutes, which keeps typing from burning through the quota.

export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, 40)
  if (!query) return Response.json({ matches: [] })

  const matches = await searchSymbols(query, 8)
  return Response.json(
    { matches },
    { headers: { 'cache-control': 'public, max-age=300, s-maxage=3600' } }
  )
}
