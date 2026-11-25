// Where something was bought: the crypto exchange a coin is priced on, and the
// stock market a share is listed on. Pure, with no imports beyond types, so it
// runs in the browser, on the server, and under plain `node --test`.
//
// Crypto. A coin can be priced on the exchange it was bought on instead of
// FolioQ's automatic choice (Coinbase, then Kraken). Each exchange prices it
// in one quote currency: US dollars, the USDT stablecoin, or a local currency
// (won on Upbit, yen on bitFlyer). Everything FolioQ stores stays in US
// dollars: USDT is converted at its own US-dollar price, a local currency at
// the exchange rate. Every exchange here has a free public price feed that
// needs no key. They differ in how far back they keep prices by the minute,
// which `history` records (see lib/venue-prices.ts for the details).
//
// Shares. Outside the US, a share is the ticker plus its market's Yahoo
// Finance suffix: DBS on the Singapore Exchange is D05.SI. That full symbol is
// what is stored, so the market is part of the ticker and needs no column.

export interface CryptoVenue {
  /** Stored in holdings.exchange. Lower case, never changes once released. */
  id: string
  name: string
  url: string
  /** What the coin is priced in on this exchange: USD, USDT, or a local currency. */
  quote: string
  /**
   * How far back it keeps prices at a moment in time:
   *   minute  by the minute, for years
   *   recent  by the minute for days or weeks, then by the hour or day
   *   daily   only recent minutes and hours, then whole days
   *   hours   by the hour for the last ten days only
   *   none    live prices only
   * Where an exchange has no price for a moment, Coinbase's or Kraken's is used and the form says so.
   */
  history: 'minute' | 'recent' | 'daily' | 'hours' | 'none'
  /** Where it is based, to help people find theirs in the list. */
  region: string
}

export const CRYPTO_VENUES: CryptoVenue[] = [
  { id: 'coinbase', name: 'Coinbase', url: 'https://exchange.coinbase.com', quote: 'USD', history: 'minute', region: 'United States' },
  { id: 'kraken', name: 'Kraken', url: 'https://www.kraken.com', quote: 'USD', history: 'minute', region: 'United States' },
  { id: 'binance', name: 'Binance', url: 'https://www.binance.com', quote: 'USDT', history: 'minute', region: 'Global' },
  { id: 'okx', name: 'OKX', url: 'https://www.okx.com', quote: 'USDT', history: 'minute', region: 'Global' },
  { id: 'bybit', name: 'Bybit', url: 'https://www.bybit.com', quote: 'USDT', history: 'minute', region: 'Global' },
  { id: 'bitget', name: 'Bitget', url: 'https://www.bitget.com', quote: 'USDT', history: 'minute', region: 'Global' },
  { id: 'kucoin', name: 'KuCoin', url: 'https://www.kucoin.com', quote: 'USDT', history: 'minute', region: 'Global' },
  { id: 'gate', name: 'Gate', url: 'https://www.gate.io', quote: 'USDT', history: 'recent', region: 'Global' },
  { id: 'mexc', name: 'MEXC', url: 'https://www.mexc.com', quote: 'USDT', history: 'recent', region: 'Global' },
  { id: 'htx', name: 'HTX', url: 'https://www.htx.com', quote: 'USDT', history: 'daily', region: 'Global' },
  { id: 'cryptocom', name: 'Crypto.com', url: 'https://crypto.com/exchange', quote: 'USD', history: 'minute', region: 'Global' },
  { id: 'bitstamp', name: 'Bitstamp', url: 'https://www.bitstamp.net', quote: 'USD', history: 'minute', region: 'Europe' },
  { id: 'bitfinex', name: 'Bitfinex', url: 'https://www.bitfinex.com', quote: 'USD', history: 'minute', region: 'Global' },
  { id: 'gemini', name: 'Gemini', url: 'https://www.gemini.com', quote: 'USD', history: 'daily', region: 'United States' },
  { id: 'upbit', name: 'Upbit', url: 'https://upbit.com', quote: 'KRW', history: 'minute', region: 'South Korea' },
  { id: 'bithumb', name: 'Bithumb', url: 'https://www.bithumb.com', quote: 'KRW', history: 'minute', region: 'South Korea' },
  { id: 'bitflyer', name: 'bitFlyer', url: 'https://bitflyer.com', quote: 'JPY', history: 'none', region: 'Japan' },
  { id: 'indodax', name: 'Indodax', url: 'https://indodax.com', quote: 'IDR', history: 'minute', region: 'Indonesia' },
  { id: 'independentreserve-sgd', name: 'Independent Reserve', url: 'https://www.independentreserve.com', quote: 'SGD', history: 'hours', region: 'Singapore' },
  { id: 'independentreserve-aud', name: 'Independent Reserve', url: 'https://www.independentreserve.com', quote: 'AUD', history: 'hours', region: 'Australia' },
  { id: 'independentreserve-nzd', name: 'Independent Reserve', url: 'https://www.independentreserve.com', quote: 'NZD', history: 'hours', region: 'New Zealand' },
  { id: 'luno-myr', name: 'Luno', url: 'https://www.luno.com', quote: 'MYR', history: 'none', region: 'Malaysia' },
  { id: 'luno-idr', name: 'Luno', url: 'https://www.luno.com', quote: 'IDR', history: 'none', region: 'Indonesia' },
  { id: 'luno-zar', name: 'Luno', url: 'https://www.luno.com', quote: 'ZAR', history: 'none', region: 'South Africa' },
]

const BY_ID = new Map(CRYPTO_VENUES.map((v) => [v.id, v]))

export function cryptoVenue(id: unknown): CryptoVenue | null {
  return typeof id === 'string' ? (BY_ID.get(id) ?? null) : null
}

/** A stored exchange, or null for FolioQ's automatic choice (also for anything unknown). */
export function toVenueId(value: unknown): string | null {
  return cryptoVenue(value)?.id ?? null
}

/** "Binance (BTC/USDT)": the exchange and the market a coin is priced on. */
export function venueLabel(venue: CryptoVenue, coin: string): string {
  return `${venue.name} (${coin}/${venue.quote})`
}

/** How far back an exchange's prices at a moment go, in words for the picker. */
export function historyWords(venue: CryptoVenue): string {
  switch (venue.history) {
    case 'minute':
      return 'Past prices to the minute'
    case 'recent':
      return 'Past prices to the minute for recent weeks, then by the hour'
    case 'daily':
      return 'Past prices by the minute or hour for recent days, then by the day'
    case 'hours':
      return 'Past prices by the hour for the last 10 days; earlier ones from Coinbase or Kraken'
    case 'none':
      return 'Live prices only; past prices come from Coinbase or Kraken'
  }
}

// ---------------------------------------------------------------- stock markets

export interface StockMarket {
  /** Short code shown in the picker and used by the forms. */
  id: string
  name: string
  /** Yahoo Finance's suffix for the market's tickers. Empty for the US. */
  suffix: string
  /** The currency shares there trade in. Some quote in hundredths (pence, cents); see lib/yahoo.ts. */
  currency: string
  /** A ticker someone might type, as an example. */
  example: string
}

/**
 * Markets with a free price feed (Yahoo Finance's public chart) in a currency
 * FolioQ has an exchange rate for. US shares keep Finnhub for live prices.
 */
export const STOCK_MARKETS: StockMarket[] = [
  { id: 'US', name: 'United States (NYSE, Nasdaq)', suffix: '', currency: 'USD', example: 'AAPL' },
  { id: 'SGX', name: 'Singapore (SGX)', suffix: '.SI', currency: 'SGD', example: 'D05' },
  { id: 'HKEX', name: 'Hong Kong (HKEX)', suffix: '.HK', currency: 'HKD', example: '0700' },
  { id: 'TSE', name: 'Japan (Tokyo)', suffix: '.T', currency: 'JPY', example: '7203' },
  { id: 'KRX', name: 'South Korea (KOSPI)', suffix: '.KS', currency: 'KRW', example: '005930' },
  { id: 'KOSDAQ', name: 'South Korea (KOSDAQ)', suffix: '.KQ', currency: 'KRW', example: '247540' },
  { id: 'SSE', name: 'China (Shanghai)', suffix: '.SS', currency: 'CNY', example: '600519' },
  { id: 'SZSE', name: 'China (Shenzhen)', suffix: '.SZ', currency: 'CNY', example: '000858' },
  { id: 'NSE', name: 'India (NSE)', suffix: '.NS', currency: 'INR', example: 'RELIANCE' },
  { id: 'BSE', name: 'India (BSE)', suffix: '.BO', currency: 'INR', example: '500325' },
  { id: 'BURSA', name: 'Malaysia (Bursa)', suffix: '.KL', currency: 'MYR', example: '1155' },
  { id: 'IDX', name: 'Indonesia (IDX)', suffix: '.JK', currency: 'IDR', example: 'BBCA' },
  { id: 'SET', name: 'Thailand (SET)', suffix: '.BK', currency: 'THB', example: 'PTT' },
  { id: 'PSE', name: 'Philippines (PSE)', suffix: '.PS', currency: 'PHP', example: 'BDO' },
  { id: 'ASX', name: 'Australia (ASX)', suffix: '.AX', currency: 'AUD', example: 'CBA' },
  { id: 'NZX', name: 'New Zealand (NZX)', suffix: '.NZ', currency: 'NZD', example: 'FPH' },
  { id: 'LSE', name: 'United Kingdom (London)', suffix: '.L', currency: 'GBP', example: 'BARC' },
  { id: 'XETRA', name: 'Germany (XETRA)', suffix: '.DE', currency: 'EUR', example: 'SAP' },
  { id: 'EPA', name: 'France (Euronext Paris)', suffix: '.PA', currency: 'EUR', example: 'MC' },
  { id: 'AMS', name: 'Netherlands (Euronext Amsterdam)', suffix: '.AS', currency: 'EUR', example: 'ASML' },
  { id: 'EBR', name: 'Belgium (Euronext Brussels)', suffix: '.BR', currency: 'EUR', example: 'ABI' },
  { id: 'BIT', name: 'Italy (Milan)', suffix: '.MI', currency: 'EUR', example: 'ENI' },
  { id: 'BME', name: 'Spain (Madrid)', suffix: '.MC', currency: 'EUR', example: 'SAN' },
  { id: 'ELI', name: 'Portugal (Lisbon)', suffix: '.LS', currency: 'EUR', example: 'EDP' },
  { id: 'ISE', name: 'Ireland (Dublin)', suffix: '.IR', currency: 'EUR', example: 'RYA' },
  { id: 'VIE', name: 'Austria (Vienna)', suffix: '.VI', currency: 'EUR', example: 'OMV' },
  { id: 'HEL', name: 'Finland (Helsinki)', suffix: '.HE', currency: 'EUR', example: 'NOKIA' },
  { id: 'SIX', name: 'Switzerland (SIX)', suffix: '.SW', currency: 'CHF', example: 'NESN' },
  { id: 'STO', name: 'Sweden (Stockholm)', suffix: '.ST', currency: 'SEK', example: 'VOLV-B' },
  { id: 'CPH', name: 'Denmark (Copenhagen)', suffix: '.CO', currency: 'DKK', example: 'NOVO-B' },
  { id: 'OSL', name: 'Norway (Oslo)', suffix: '.OL', currency: 'NOK', example: 'EQNR' },
  { id: 'WSE', name: 'Poland (Warsaw)', suffix: '.WA', currency: 'PLN', example: 'PKO' },
  { id: 'PRA', name: 'Czechia (Prague)', suffix: '.PR', currency: 'CZK', example: 'CEZ' },
  { id: 'BUD', name: 'Hungary (Budapest)', suffix: '.BD', currency: 'HUF', example: 'OTP' },
  { id: 'BIST', name: 'Turkey (Istanbul)', suffix: '.IS', currency: 'TRY', example: 'THYAO' },
  { id: 'TASE', name: 'Israel (Tel Aviv)', suffix: '.TA', currency: 'ILS', example: 'TEVA' },
  { id: 'JSE', name: 'South Africa (Johannesburg)', suffix: '.JO', currency: 'ZAR', example: 'NPN' },
  { id: 'TSX', name: 'Canada (Toronto)', suffix: '.TO', currency: 'CAD', example: 'RY' },
  { id: 'TSXV', name: 'Canada (TSX Venture)', suffix: '.V', currency: 'CAD', example: 'NDA' },
  { id: 'B3', name: 'Brazil (B3)', suffix: '.SA', currency: 'BRL', example: 'PETR4' },
  { id: 'BMV', name: 'Mexico (BMV)', suffix: '.MX', currency: 'MXN', example: 'WALMEX' },
]

export const US_MARKET = STOCK_MARKETS[0]

const BY_SUFFIX = new Map(STOCK_MARKETS.filter((m) => m.suffix).map((m) => [m.suffix, m]))
const MARKET_BY_ID = new Map(STOCK_MARKETS.map((m) => [m.id, m]))

export function stockMarket(id: unknown): StockMarket | null {
  return typeof id === 'string' ? (MARKET_BY_ID.get(id) ?? null) : null
}

/**
 * The market a stored ticker trades on, from its suffix. A US ticker with a
 * share class (BRK.B) has no market suffix after its dot, so it stays US.
 */
export function marketOf(ticker: string): StockMarket {
  const dot = ticker.lastIndexOf('.')
  if (dot <= 0) return US_MARKET
  return BY_SUFFIX.get(ticker.slice(dot).toUpperCase()) ?? US_MARKET
}

/** True for a share listed outside the US: priced from Yahoo Finance, in its own currency. */
export function isForeignListing(ticker: string): boolean {
  return marketOf(ticker) !== US_MARKET
}

/**
 * The ticker to store for what was typed on a market: the market's suffix is
 * added unless it is already there. "d05" on SGX is D05.SI; on the US market
 * the typed ticker is kept as it is.
 */
export function tickerOn(typed: string, market: StockMarket): string {
  const value = typed.trim().toUpperCase()
  if (!market.suffix || !value) return value
  return value.endsWith(market.suffix) ? value : `${value}${market.suffix}`
}

/** The ticker without its market suffix, as people know it: D05 for D05.SI. */
export function localTicker(ticker: string): string {
  const market = marketOf(ticker)
  return market.suffix ? ticker.slice(0, -market.suffix.length) : ticker
}

/** The symbol Yahoo Finance uses: US share classes take a dash (BRK-B), suffixed tickers stay as they are. */
export function yahooSymbol(ticker: string): string {
  return isForeignListing(ticker) ? ticker : ticker.replace(/\./g, '-')
}
