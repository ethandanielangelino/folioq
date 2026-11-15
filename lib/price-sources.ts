// Where FolioQ's prices come from, so every figure can name its source.
// Safe to import from client components: only names, links, and the list of
// exchanges that quote crypto directly in each currency.

export interface PriceSource {
  name: string
  url: string
  /**
   * The market's pair when the price is quoted directly in the display
   * currency, e.g. "BTC/SGD". Absent when the price is in US dollars.
   */
  pair?: string
  /** True when no source answered and this is FolioQ's last saved price. */
  saved?: boolean
}

export const FINNHUB: PriceSource = { name: 'Finnhub', url: 'https://finnhub.io' }
export const COINBASE: PriceSource = { name: 'Coinbase', url: 'https://exchange.coinbase.com' }
export const KRAKEN: PriceSource = { name: 'Kraken', url: 'https://www.kraken.com' }
export const GOLD_API: PriceSource = { name: 'gold-api.com', url: 'https://gold-api.com' }
export const INDEPENDENT_RESERVE: PriceSource = { name: 'Independent Reserve', url: 'https://www.independentreserve.com' }
export const LUNO: PriceSource = { name: 'Luno', url: 'https://www.luno.com' }
export const YAHOO: PriceSource = { name: 'Yahoo Finance', url: 'https://finance.yahoo.com' }
export const YAHOO_FUTURES: PriceSource = { name: 'Yahoo Finance (COMEX futures)', url: 'https://finance.yahoo.com' }
/** The last price FolioQ saved, used when no source answers. */
export const SAVED: PriceSource = { name: 'FolioQ’s last saved price', url: '/terms#prices', saved: true }

/**
 * Exchanges with a public price for crypto quoted directly in each currency,
 * best first (most trading). Checked against each exchange's own list of
 * markets; a coin an exchange doesn't trade in that currency simply falls
 * back to the US-dollar price, converted.
 */
export const DIRECT_CRYPTO: Record<string, PriceSource[]> = {
  EUR: [COINBASE, KRAKEN],
  GBP: [COINBASE, KRAKEN, LUNO],
  AUD: [KRAKEN, INDEPENDENT_RESERVE, LUNO],
  CAD: [KRAKEN],
  JPY: [KRAKEN],
  CHF: [KRAKEN],
  INR: [COINBASE],
  SGD: [INDEPENDENT_RESERVE],
  NZD: [INDEPENDENT_RESERVE],
  MYR: [LUNO],
  IDR: [LUNO],
  ZAR: [LUNO],
}

/** The exchanges that may quote crypto directly in this currency (none for US dollars). */
export function directExchanges(currency: string): PriceSource[] {
  return DIRECT_CRYPTO[currency] ?? []
}

/** "Independent Reserve (BTC/SGD)", or just the name. */
export function sourceLabel(source: PriceSource): string {
  return source.pair ? `${source.name} (${source.pair})` : source.name
}

/** "Coinbase or Kraken", "A, B, or C". */
export function namesList(names: string[]): string {
  const unique = [...new Set(names)]
  if (unique.length <= 1) return unique[0] ?? ''
  if (unique.length === 2) return `${unique[0]} or ${unique[1]}`
  return `${unique.slice(0, -1).join(', ')}, or ${unique.at(-1)}`
}

/** How far apart a market's best bid and offer may be for its middle to be trusted. */
const MAX_SPREAD = 0.02
/** How far a direct price may sit from the US-dollar price converted before it is doubted. */
const TOLERANCE = 0.05

/**
 * The price from a market's best bid and offer: their middle, if they are
 * close enough together to trust. Null otherwise.
 */
export function midPrice(bid: number, ask: number): number | null {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null
  const mid = (bid + ask) / 2
  return (ask - bid) / mid <= MAX_SPREAD ? mid : null
}

/** Whether a direct price is close enough to the converted US-dollar one to use. */
export function believable(direct: number, converted: number): boolean {
  return direct > 0 && converted > 0 && Math.abs(direct - converted) / converted <= TOLERANCE
}
