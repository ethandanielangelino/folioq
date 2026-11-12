// Display currencies. Pure functions with no imports, so they run in the
// browser, on the server, and under plain `node --test`.
//
// Everything FolioQ stores and calculates is in US dollars, because that is
// what US-listed shares trade in. A display currency only changes how an
// amount is shown: it is multiplied by today's rate at the moment it is
// printed. Percentages don't change.

export interface Money {
  /** ISO code, e.g. "SGD". */
  code: string
  /** How many units of `code` one US dollar buys. 1 for USD. */
  rate: number
}

export const USD: Money = { code: 'USD', rate: 1 }

/**
 * The currencies on offer: the ones the European Central Bank publishes a
 * reference rate for, so there is always an official figure to fall back on.
 */
export const CURRENCIES: { code: string; name: string }[] = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' },
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'AUD', name: 'Australian dollar' },
  { code: 'CAD', name: 'Canadian dollar' },
  { code: 'CHF', name: 'Swiss franc' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'INR', name: 'Indian rupee' },
  { code: 'IDR', name: 'Indonesian rupiah' },
  { code: 'KRW', name: 'South Korean won' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'NZD', name: 'New Zealand dollar' },
  { code: 'PHP', name: 'Philippine peso' },
  { code: 'THB', name: 'Thai baht' },
  { code: 'BRL', name: 'Brazilian real' },
  { code: 'MXN', name: 'Mexican peso' },
  { code: 'ZAR', name: 'South African rand' },
  { code: 'SEK', name: 'Swedish krona' },
  { code: 'NOK', name: 'Norwegian krone' },
  { code: 'DKK', name: 'Danish krone' },
  { code: 'PLN', name: 'Polish zloty' },
  { code: 'CZK', name: 'Czech koruna' },
  { code: 'HUF', name: 'Hungarian forint' },
  { code: 'RON', name: 'Romanian leu' },
  { code: 'ISK', name: 'Icelandic krona' },
  { code: 'ILS', name: 'Israeli shekel' },
  { code: 'TRY', name: 'Turkish lira' },
]

const CODES = new Set(CURRENCIES.map((c) => c.code))

export function isCurrency(code: unknown): code is string {
  return typeof code === 'string' && CODES.has(code)
}

/** Currencies whose amounts are large enough that nobody quotes the decimals. */
const WHOLE_UNITS = new Set(['JPY', 'KRW', 'IDR', 'HUF', 'ISK'])
const decimals = (code: string) => (WHOLE_UNITS.has(code) ? 0 : 2)

/** Typographic minus so negative numbers align and read cleanly. */
const MINUS = '−'

const formatters = new Map<string, Intl.NumberFormat>()
function formatter(code: string, compact: boolean): Intl.NumberFormat {
  const key = `${code}:${compact}`
  let made = formatters.get(key)
  if (!made) {
    // "symbol" keeps dollar currencies apart: $ for USD, SGD, A$, HK$ and so on.
    made = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      ...(compact
        ? { notation: 'compact', maximumFractionDigits: 1 }
        : { minimumFractionDigits: decimals(code), maximumFractionDigits: decimals(code) }),
    })
    formatters.set(key, made)
  }
  return made
}

/** A US-dollar amount in the display currency, rounded to what that currency shows. */
function convert(usdValue: number, money: Money): number {
  const scale = 10 ** decimals(money.code)
  const rounded = Math.round(usdValue * money.rate * scale) / scale
  // Avoid "-$0.00" for tiny negative rounding leftovers.
  return rounded === 0 ? 0 : rounded
}

/** "$1,204.10", "SGD 1,547.51", "¥191,733" */
export function money(usdValue: number, m: Money = USD): string {
  return formatter(m.code, false).format(convert(usdValue, m)).replace('-', MINUS)
}

/** "$1.2K", "€3.4M" */
export function moneyCompact(usdValue: number, m: Money = USD): string {
  return formatter(m.code, true).format(usdValue * m.rate).replace('-', MINUS)
}

/** "+$1,204.10" / "−$88.00" / "$0.00" */
export function moneySigned(usdValue: number, m: Money = USD): string {
  const value = convert(usdValue, m)
  if (value === 0) return formatter(m.code, false).format(0)
  return (value > 0 ? '+' : MINUS) + formatter(m.code, false).format(Math.abs(value))
}

/** "1 USD = 1.2852 SGD" */
export function describeRate(m: Money): string {
  const places = m.rate >= 100 ? 2 : m.rate >= 10 ? 3 : 4
  const shown = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  }).format(m.rate)
  return `1 USD = ${shown} ${m.code}`
}

/** How far a live rate may sit from the central bank's before it is distrusted. */
const TOLERANCE = 0.05

/**
 * Chooses the rate to use for a currency from a live feed and the central
 * bank's daily reference. The live figure is preferred, but only when it is
 * a sensible number close to the official one; a feed that returns something
 * wild is ignored instead of being shown to someone as their portfolio value.
 */
export function pickRate(
  live: number | null | undefined,
  reference: number | null | undefined
): { rate: number; source: 'live' | 'reference' } | null {
  const usable = (n: number | null | undefined): n is number =>
    typeof n === 'number' && Number.isFinite(n) && n > 0

  if (usable(live) && usable(reference)) {
    const drift = Math.abs(live - reference) / reference
    return drift <= TOLERANCE ? { rate: live, source: 'live' } : { rate: reference, source: 'reference' }
  }
  if (usable(reference)) return { rate: reference, source: 'reference' }
  if (usable(live)) return { rate: live, source: 'live' }
  return null
}
