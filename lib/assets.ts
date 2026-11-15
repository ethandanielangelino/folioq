// What kind of thing a holding is. Pure functions with no imports, so they run
// in the browser, on the server, and under plain `node --test`.
//
// Four kinds, each priced its own way:
//   listed  a US-listed ticker (stock or ETF), from Finnhub. It can be grouped
//           as stock, bond, property, or commodity, which only changes how it
//           is grouped on the page.
//   crypto  a coin such as BTC, from Coinbase (Kraken as a backup)
//   metal   gold or silver you own, per troy ounce, from gold-api.com
//   cash    money held in a currency, converted at the exchange rate

export type AssetClass = 'stock' | 'bond' | 'property' | 'commodity' | 'crypto' | 'metal' | 'cash'
export type AssetKind = 'listed' | 'crypto' | 'metal' | 'cash'

export const ASSET_CLASSES: AssetClass[] = ['stock', 'bond', 'property', 'commodity', 'crypto', 'metal', 'cash']

/** How a listed fund can be grouped. A company's own shares are always a stock (or property, for a REIT). */
export const LISTED_GROUPS: { value: AssetClass; label: string; example: string }[] = [
  { value: 'stock', label: 'Stock fund', example: 'a fund of shares like SPY' },
  { value: 'bond', label: 'Bond fund', example: 'a bond fund like BND' },
  { value: 'property', label: 'Property fund', example: 'a real-estate fund like VNQ' },
  { value: 'commodity', label: 'Commodity fund', example: 'a gold or oil fund like GLD' },
]

/**
 * What a listed ticker is, from the exchange listing: a company's shares, a
 * property company (REIT), or a fund. Unknown when the listing couldn't be read.
 */
export type ListingType = 'company' | 'reit' | 'fund' | 'unknown'

/** Finnhub's security type ("Common Stock", "ETP", "REIT", ...) as a listing type. */
export function listingTypeOf(securityType: string | null | undefined): ListingType {
  const t = (securityType ?? '').trim().toUpperCase()
  if (!t) return 'unknown'
  if (t === 'REIT') return 'reit'
  if (/ETP|ETF|ETN|FUND|UNIT|TRUST/.test(t)) return 'fund'
  return 'company'
}

/** A fund's likely group, from words in its name. Stock fund when nothing says otherwise. */
export function guessFundGroup(description: string | null | undefined): AssetClass {
  const d = ` ${(description ?? '').toUpperCase()} `
  if (/\b(BOND|BONDS|TREASURY|TREASURIES|AGGREGATE|FIXED INCOME|MUNI|MUNICIPAL|CORPORATE|TIPS|T-BILL|INCOME)\b/.test(d)) return 'bond'
  if (/\b(REAL ESTATE|REIT|REITS|PROPERTY|PROPERTIES)\b/.test(d)) return 'property'
  if (/\b(GOLD|SILVER|PLATINUM|PALLADIUM|PRECIOUS|COMMODITY|COMMODITIES|OIL|CRUDE|NATURAL GAS|AGRICULTURE|COPPER)\b/.test(d)) return 'commodity'
  return 'stock'
}

/**
 * The groups a listed ticker may be put in. A company's shares are a stock and
 * nothing else; a REIT is property; a fund can be any fund group. If the
 * listing couldn't be read, any group is allowed.
 */
export function allowedGroups(type: ListingType): AssetClass[] {
  if (type === 'company') return ['stock']
  if (type === 'reit') return ['property']
  return LISTED_GROUPS.map((g) => g.value)
}

/**
 * The label shown beside every holding, so each one says what it is.
 * `isCompany` tells a company's shares from a fund for listed tickers.
 */
export function assetLabel(assetClass: AssetClass, isCompany: boolean): string {
  switch (assetClass) {
    case 'stock':
      return isCompany ? 'Stock' : 'Stock fund'
    case 'bond':
      return 'Bond fund'
    case 'property':
      return isCompany ? 'Property company' : 'Property fund'
    case 'commodity':
      return 'Commodity fund'
    case 'crypto':
      return 'Crypto'
    case 'metal':
      return 'Precious metal'
    case 'cash':
      return 'Cash'
  }
}

export const METALS: Record<string, string> = { XAU: 'Gold', XAG: 'Silver' }

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === 'string' && (ASSET_CLASSES as string[]).includes(value)
}

/** Anything unknown or missing (a database without supabase/assets.sql) counts as a stock. */
export function toAssetClass(value: unknown): AssetClass {
  return isAssetClass(value) ? value : 'stock'
}

export function kindOf(assetClass: AssetClass): AssetKind {
  if (assetClass === 'crypto' || assetClass === 'metal' || assetClass === 'cash') return assetClass
  return 'listed'
}

/** The heading a holding is grouped under in "By asset type". */
export function groupLabel(assetClass: AssetClass): string {
  switch (assetClass) {
    case 'bond':
      return 'Bonds'
    case 'property':
      return 'Property'
    case 'commodity':
      return 'Commodity funds'
    case 'metal':
      return 'Gold & silver'
    case 'crypto':
      return 'Crypto'
    case 'cash':
      return 'Cash'
    default:
      return 'Stocks'
  }
}

/**
 * The key a holding's prices are stored and looked up under. Listed tickers
 * use the ticker itself (as they always have); the others carry a prefix so
 * that, for example, the coin BTC and the US fund whose ticker is BTC never
 * share a price.
 */
export function priceKey(ticker: string, assetClass: AssetClass): string {
  const kind = kindOf(assetClass)
  return kind === 'listed' ? ticker : `${kind.toUpperCase()}:${ticker}`
}

/** What one unit of the quantity is called. */
export function unitName(assetClass: AssetClass, count = 2): string {
  const kind = kindOf(assetClass)
  if (kind === 'crypto') return count === 1 ? 'coin' : 'coins'
  if (kind === 'metal') return count === 1 ? 'troy ounce' : 'troy ounces'
  if (kind === 'cash') return ''
  return count === 1 ? 'share' : 'shares'
}

/**
 * Reads what someone typed into the symbol for a given kind of holding.
 * Returns the stored form, or null with no change made if it can't be one.
 */
export function normalizeAssetSymbol(input: string, assetClass: AssetClass): string | null {
  const value = input.trim().toUpperCase()
  const kind = kindOf(assetClass)
  if (kind === 'crypto') return /^[A-Z0-9]{2,10}$/.test(value) ? value : null
  if (kind === 'metal') return value in METALS ? value : null
  if (kind === 'cash') return /^[A-Z]{3}$/.test(value) ? value : null
  return /^[A-Z0-9.\-]{1,12}$/.test(value) ? value : null
}
