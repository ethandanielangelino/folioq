'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { Banknote, Bitcoin, CalendarDays, ChartLine, Gem, Receipt, ShoppingCart } from 'lucide-react'
import { useMoney } from '@/app/components/money'
import { dialogPanel, errorText, field, fieldLabel, outlineButton, primaryButton } from '@/app/components/styles'
import { useToast } from '@/app/components/toast'
import {
  addHolding,
  classifyTicker,
  getPriceOn,
  suggestSymbols,
  type Classification,
} from '@/app/dashboard/actions'
import {
  CashSelect,
  OUTSIDE,
  currencyName,
  defaultPayFrom,
  inOwn,
  useRate,
  type CashLine,
} from '@/app/dashboard/[id]/cash-choice'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { SymbolMatch } from '@/lib/finnhub'
import { LISTED_GROUPS, METALS, allowedGroups, assetLabel, kindOf, type AssetClass, type AssetKind } from '@/lib/assets'
import type { ChatAction } from '@/lib/chat-actions'
import { CURRENCIES, USD } from '@/lib/currency'
import type { DatedPrice } from '@/lib/dated-price'
import { formatDate, formatDayDate, formatMoney, formatShares } from '@/lib/format'
import { cashCovers, unitsForMoney } from '@/lib/portfolio'
import {
  CurrencySelect,
  EnterBySwitch,
  MoneyInput,
  PriceOrigin,
  moneyCurrencies,
  shownPrice,
  type EnterBy,
} from '@/app/dashboard/[id]/amount-choice'

/** The four kinds of holding, as they are offered when adding one. */
const KINDS: { kind: AssetKind; label: string; hint: string; Icon: typeof ChartLine }[] = [
  { kind: 'listed', label: 'Stock or fund', hint: 'Listed in the US', Icon: ChartLine },
  { kind: 'crypto', label: 'Crypto', hint: 'BTC, ETH and more', Icon: Bitcoin },
  { kind: 'metal', label: 'Gold or silver', hint: 'Metal you own', Icon: Gem },
  { kind: 'cash', label: 'Cash', hint: 'Savings, any currency', Icon: Banknote },
]

const POPULAR_COINS = ['BTC', 'ETH', 'SOL', 'XRP']
type How = 'bought' | 'owned'
type Quote = { status: 'idle' } | { status: 'loading' } | { status: 'done'; asked: string; result: DatedPrice }

const card = (active: boolean) =>
  `flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-[border-color,background-color] duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
    active
      ? 'border-mint-600 bg-mint-600/[.08] dark:border-mint-400 dark:bg-mint-400/[.1]'
      : 'border-black/[.1] hover:border-black/25 dark:border-white/[.15] dark:hover:border-white/30'
  }`

const chip = (active: boolean) =>
  `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? 'bg-black text-white dark:bg-white dark:text-black'
      : 'border border-black/[.1] text-zinc-700 hover:border-black/30 dark:border-white/[.15] dark:text-zinc-300 dark:hover:border-white/40'
  }`

const pill =
  'rounded-full bg-black/[.05] px-2 py-0.5 text-[0.7rem] font-medium text-zinc-700 dark:bg-white/[.08] dark:text-zinc-200'

/** What a form starts with when the assistant set it up from the owner's message. */
export type AddInitial = Omit<Extract<ChatAction, { type: 'add' }>, 'id' | 'type'>

/** Told to whoever opened the form once it has saved: a short confirmation, and the record in words. */
export type Done = { toast: string; record: string }

const day = (iso: string) => formatDate(iso)

/**
 * Adds a holding. It asks first what kind of thing it is, then (for anything
 * but cash) whether it was just bought or is already owned: a purchase is
 * priced at the market on the date bought and can be paid from cash; something
 * already owned takes the average cost from your broker.
 *
 * Used in the Add a holding dialog, and in the assistant's chat, where it
 * starts from what the owner already said and asks for the rest. There it
 * also spells out what will be recorded, right above Confirm.
 */
export function AddHoldingForm({
  portfolioId,
  today,
  assetTypes = true,
  cashLines,
  initial,
  onDone,
  onCancel,
  mode = 'dialog',
}: {
  portfolioId: string
  /** Today's market date, YYYY-MM-DD, from the server. */
  today: string
  /** False until supabase/assets.sql has been run: only stocks can be added. */
  assetTypes?: boolean
  cashLines: CashLine[]
  initial?: AddInitial
  onDone: (done: Done) => void
  /** Chat only: the dialog has its own Cancel. */
  onCancel?: () => void
  mode?: 'dialog' | 'chat'
}) {
  const chat = mode === 'chat'
  const money = useMoney()
  const display = money.wanted || money.code
  const uid = useId()
  const startKind = initial?.kind && (initial.kind !== 'listed' || assetTypes) ? initial.kind : undefined
  const startClass: AssetClass = startKind && startKind !== 'listed' ? startKind : 'stock'
  const startTicker = initial?.ticker ?? (startKind === 'metal' ? 'XAU' : '')
  const startHow: How | null = initial?.how ?? null
  const [assetClass, setAssetClass] = useState<AssetClass>(startClass)
  // In the chat, nothing is chosen for the owner: until they pick a kind, only the kinds show.
  const [kindChosen, setKindChosen] = useState(!chat || startKind !== undefined)
  const kind = kindOf(assetClass)
  const [ticker, setTicker] = useState(startTicker)
  const [matches, setMatches] = useState<SymbolMatch[]>([])
  const [listing, setListing] = useState<{ ticker: string; found: Classification } | null>(null)
  const [how, setHow] = useState<How | null>(startHow)
  const [quantity, setQuantity] = useState(initial?.quantity ? String(initial.quantity) : '')
  const [openedAt, setOpenedAt] = useState(initial?.date ?? today)
  const [cost, setCost] = useState(initial?.cost ? String(initial.cost.amount) : '')
  const [costCurrency, setCostCurrency] = useState(initial?.cost?.currency ?? 'USD')
  const [payChoice, setPayChoice] = useState<string | null>(initial?.payFrom ?? null)
  const [manualPrice, setManualPrice] = useState('')
  const [quote, setQuote] = useState<Quote>(
    startHow === 'bought' && startTicker && kindChosenAtStart(chat, startKind) ? { status: 'loading' } : { status: 'idle' }
  )
  // How much: as a number of shares or coins, or as money (FolioQ works out how many).
  const [enterBy, setEnterBy] = useState<EnterBy>(initial?.spend ? 'money' : 'units')
  const [spend, setSpend] = useState(initial?.spend ? String(initial.spend.amount) : '')
  const [spendChoice, setSpendChoice] = useState<string | null>(initial?.spend?.currency ?? null)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const asked = useRef({ search: 0, listing: 0, price: 0 })

  const isCash = kind === 'cash'
  const bought = !isCash && how === 'bought'
  const symbol = ticker.trim().toUpperCase()
  const found = listing?.ticker === symbol ? listing.found : null
  const groups = kind === 'listed' && found ? allowedGroups(found.type) : null

  // Paying for a purchase from cash.
  const payFrom = payChoice ?? defaultPayFrom(cashLines, display)
  const paying = bought && payFrom !== OUTSIDE
  const rate = useRate(paying ? payFrom : null, openedAt)
  const priceKeyNow = `${assetClass}|${symbol}|${openedAt}`
  const market = quote.status === 'done' && quote.asked === priceKeyNow && quote.result.ok ? quote.result : null
  const noMarketPrice = quote.status === 'done' && quote.asked === priceKeyNow && !quote.result.ok
  const typed = Number(manualPrice)
  const price = market?.price ?? (noMarketPrice && typed > 0 ? typed : null)

  // Entered as money: bought, it is the amount spent at the price on that day
  // (in the paying cash's currency, or yours); owned, the total paid divided
  // by the average cost, both in the same currency.
  const byMoney = !isCash && how !== null && enterBy === 'money'
  const spendCurrency = paying ? payFrom : (spendChoice ?? display)
  const ownSpendRate = useRate(bought && byMoney && !paying ? spendCurrency : null, openedAt)
  const spendRate = paying ? rate : ownSpendRate
  const spent = Number(spend)
  const qty = !byMoney
    ? Number(quantity)
    : bought
      ? (price !== null && typeof spendRate === 'number' ? unitsForMoney(spent, spendRate, price) : null) ?? 0
      : unitsForMoney(spent, 1, Number(cost)) ?? 0

  const costUsd = bought && price !== null && qty > 0 ? qty * price : null
  // Paying in the cash's own currency: exactly the amount typed leaves it.
  const costInCash =
    costUsd !== null && paying && typeof rate === 'number' ? (byMoney ? spent : costUsd * rate) : null
  const line = cashLines.find((l) => l.currency === payFrom)
  const shortOfCash = costInCash !== null && !cashCovers(line?.amount ?? 0, costInCash)

  const label = isCash
    ? 'Cash'
    : kind === 'listed'
      ? found
        ? assetLabel(assetClass, found.type === 'company' || found.type === 'reit')
        : null
      : assetLabel(assetClass, false)

  const ready =
    symbol !== '' &&
    qty > 0 &&
    (isCash || how !== null) &&
    (kind !== 'listed' || found !== null) &&
    (!bought || (price !== null && (!paying || (costInCash !== null && !shortOfCash))))

  function later(name: string, wait: number, run: () => void) {
    clearTimeout(timers.current[name])
    timers.current[name] = setTimeout(run, wait)
  }

  // Started by the assistant with a ticker: look it up as if it had been typed.
  useEffect(() => {
    if (!startTicker || !kindChosenAtStart(chat, startKind)) return
    const sym = startTicker.trim().toUpperCase()
    if (kindOf(startClass) === 'listed') lookUpListing(sym)
    if (startHow === 'bought' && kindOf(startClass) !== 'cash') {
      const ticket = ++asked.current.price
      const key = `${startClass}|${sym}|${initial?.date ?? today}`
      later('price', 0, async () => {
        const result = await getPriceOn(sym, startClass, initial?.date ?? today)
        if (ticket === asked.current.price) setQuote({ status: 'done', asked: key, result })
      })
    }
    // Once, for the values it started with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function lookUpPrice(next: { ticker: string; assetClass: AssetClass; openedAt: string; how: How | null }, wait = 450) {
    const ticket = ++asked.current.price
    setManualPrice('')
    if (next.how !== 'bought' || kindOf(next.assetClass) === 'cash' || !next.ticker.trim() || !next.openedAt) {
      setQuote({ status: 'idle' })
      return
    }
    setQuote({ status: 'loading' })
    const key = `${next.assetClass}|${next.ticker.trim().toUpperCase()}|${next.openedAt}`
    later('price', wait, async () => {
      const result = await getPriceOn(next.ticker, next.assetClass, next.openedAt)
      if (ticket === asked.current.price) setQuote({ status: 'done', asked: key, result })
    })
  }

  /** What the ticker is (company, REIT, fund) decides its label and the groups it may go in. */
  function lookUpListing(value: string) {
    const ticket = ++asked.current.listing
    const sym = value.trim().toUpperCase()
    if (!sym) return
    later('listing', 450, async () => {
      const result = await classifyTicker(sym)
      if (ticket !== asked.current.listing) return
      setListing({ ticker: sym, found: result })
      setAssetClass(result.suggested)
    })
  }

  function chooseKind(next: AssetKind) {
    const first = !kindChosen
    setKindChosen(true)
    if (next === kind && !first) return
    const nextClass: AssetClass = next === 'listed' ? 'stock' : next
    const nextTicker = next === 'metal' ? 'XAU' : next === 'cash' ? display : ''
    setAssetClass(nextClass)
    setTicker(nextTicker)
    setMatches([])
    setError('')
    lookUpPrice({ ticker: nextTicker, assetClass: nextClass, openedAt, how }, 0)
  }

  function changeTicker(value: string) {
    const upper = value.toUpperCase()
    setTicker(upper)
    setError('')
    lookUpPrice({ ticker: upper, assetClass, openedAt, how })
    if (kind !== 'listed') return
    lookUpListing(upper)
    const query = value.trim()
    if (!query) return setMatches([])
    const ticket = ++asked.current.search
    later('search', 250, async () => {
      const results = await suggestSymbols(query)
      if (ticket === asked.current.search) setMatches(results)
    })
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const form = new FormData()
    form.set('asset_class', assetClass)
    form.set('ticker', symbol)
    form.set('opened_at', openedAt)
    if (bought && byMoney) {
      // The server works out how many, at the price it records.
      form.set('spend', spend)
      form.set('spend_currency', spendCurrency)
    } else {
      form.set('quantity', byMoney ? String(qty) : quantity)
    }
    if (!isCash) form.set('how', how ?? 'owned')
    if (bought) {
      if (paying) form.set('pay_from', payFrom)
      if (noMarketPrice) form.set('manual_price', manualPrice)
    } else if (!isCash) {
      form.set('cost_basis', cost)
      form.set('cost_currency', costCurrency)
    }
    setError('')
    const record = describe('past')
    startTransition(async () => {
      const result = await addHolding(portfolioId, form)
      if (!result.ok) return setError(result.error)
      // Done (and the dialog closed) in the same transition as the refreshed page.
      startTransition(() => onDone({ toast: `${what} added${paying ? ', paid from cash' : ''}`, record }))
    })
  }

  const what = isCash ? `${currencyName(symbol)} cash` : kind === 'metal' ? (METALS[symbol] ?? symbol) : symbol

  /** What will be (or was) recorded, in words, for the chat. */
  function describe(tense: 'future' | 'past'): string {
    const verb = tense === 'future' ? 'Add' : 'Added'
    if (isCash) return `${verb} ${inOwn(qty, symbol)} as ${currencyName(symbol)} cash, held since ${day(openedAt)}.`
    const units = kind === 'listed' ? 'shares' : kind === 'metal' ? 'oz' : 'coins'
    const amount = byMoney && bought ? `${inOwn(spent, spendCurrency)} of ${what}` : `${formatShares(qty)} ${units === 'coins' ? what : `${units} of ${what}`}`
    if (bought) {
      const each = market ? ` at ${shownPrice(market, money)} each` : price !== null ? ` at ${formatMoney(price, USD)} each` : ''
      const paid = paying ? `, paid from ${currencyName(payFrom)} cash` : ', paid with money from outside FolioQ'
      const about = byMoney && qty > 0 ? ` (about ${formatShares(qty)} ${units})` : ''
      return `${verb} ${amount}${about}, bought ${openedAt === today ? 'today' : `on ${day(openedAt)}`}${each}${paid}.`
    }
    const costText = Number(cost) > 0 ? ` at an average cost of ${inOwn(Number(cost), costCurrency)}` : ', with no cost recorded'
    return `${verb} ${amount}, already owned since ${day(openedAt)}${costText}.`
  }

  const words = {
    listed: { amount: 'Shares', units: 'Shares', unitsLower: 'shares', cost: 'Average cost per share' },
    crypto: { amount: 'Number of coins', units: 'Coins', unitsLower: 'coins', cost: 'Average cost per coin' },
    metal: { amount: 'Troy ounces', units: 'Ounces', unitsLower: 'troy ounces', cost: 'Average cost per ounce' },
    cash: { amount: `Amount in ${symbol || 'that currency'}`, units: '', unitsLower: '', cost: '' },
  }[kind]

  return (
        <form onSubmit={onSubmit} className={`rise-in flex flex-col gap-5 ${chat ? '' : 'mt-6'}`}>
          <fieldset>
            <legend className={fieldLabel}>What are you adding?</legend>
            <div role="radiogroup" aria-label="What are you adding?" className="mt-2 grid grid-cols-2 gap-2">
              {KINDS.map(({ kind: option, label: text, hint, Icon }) => {
                const active = kindChosen && option === kind
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={!assetTypes && option !== 'listed'}
                    onClick={() => chooseKind(option)}
                    className={card(active)}
                  >
                    <Icon
                      aria-hidden="true"
                      className={`h-5 w-5 shrink-0 transition-[color,transform] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${active ? 'scale-115 text-mint-700 dark:text-mint-300' : 'text-zinc-500'}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-black dark:text-zinc-50">{text}</span>
                      {/* In a narrow chat bubble the label says enough; the hint shows from small tablets up. */}
                      <span className={`mt-0.5 text-xs leading-4 text-zinc-500 dark:text-zinc-400 ${chat ? 'hidden sm:block' : 'block'}`}>
                        {hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {!assetTypes && (
              <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                Crypto, gold and silver, and cash need one more database script: run{' '}
                <code className="font-mono">supabase/assets.sql</code> in the Supabase SQL editor.
              </p>
            )}
          </fieldset>

          {kindChosen && (
          <div key={`fields-${kind}`} className="rise-in flex flex-col gap-5">
            {/* What it is: a ticker, a coin, gold or silver, or a currency. */}
            {kind === 'listed' && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-ticker`} className={fieldLabel}>
                  Ticker
                </label>
                <input
                  id={`${uid}-ticker`}
                  name="ticker"
                  required
                  maxLength={12}
                  value={ticker}
                  onChange={(e) => changeTicker(e.target.value)}
                  list={`${uid}-matches`}
                  placeholder="AAPL"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={field}
                />
                <datalist id={`${uid}-matches`}>
                  {matches.map((m) => (
                    <option key={m.symbol} value={m.symbol}>
                      {m.description}
                    </option>
                  ))}
                </datalist>
              </div>
            )}

            {kind === 'crypto' && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-coin`} className={fieldLabel}>
                  Coin
                </label>
                <input
                  id={`${uid}-coin`}
                  name="ticker"
                  required
                  maxLength={10}
                  value={ticker}
                  onChange={(e) => changeTicker(e.target.value)}
                  placeholder="BTC"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className={field}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <span>Popular:</span>
                  {POPULAR_COINS.map((coin) => (
                    <button key={coin} type="button" onClick={() => changeTicker(coin)} className={chip(symbol === coin)}>
                      {coin}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {kind === 'metal' && (
              <fieldset>
                <legend className={fieldLabel}>Metal</legend>
                <div role="radiogroup" aria-label="Metal" className="mt-2 flex gap-2">
                  {Object.entries(METALS).map(([code, metal]) => (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={symbol === code}
                      onClick={() => changeTicker(code)}
                      className={chip(symbol === code)}
                    >
                      {metal}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {isCash && (
              <div className="flex flex-col gap-2">
                <label htmlFor={`${uid}-currency`} className={fieldLabel}>
                  Currency
                </label>
                <select
                  id={`${uid}-currency`}
                  name="ticker"
                  value={symbol}
                  onChange={(e) => setTicker(e.target.value)}
                  className={field}
                >
                  {CURRENCIES.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code}: {currency.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Its label: decided by what it is, so gold can never be called crypto. */}
            {kind === 'listed' && symbol && (
              <div aria-live="polite" data-testid="add-label">
                {!found ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">Checking what {symbol} is…</p>
                ) : found.type === 'company' || found.type === 'reit' ? (
                  <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                    {found.name ?? symbol} is {found.type === 'reit' ? 'a property company (a REIT)' : 'a company'}, so it is
                    labelled <span className={pill}>{label}</span>
                  </p>
                ) : (
                  <fieldset>
                    <legend className={fieldLabel}>Label</legend>
                    <div role="radiogroup" aria-label="Label" className="mt-2 flex flex-wrap gap-2">
                      {LISTED_GROUPS.filter((g) => groups!.includes(g.value)).map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          role="radio"
                          aria-checked={assetClass === g.value}
                          onClick={() => setAssetClass(g.value)}
                          className={chip(assetClass === g.value)}
                        >
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {found.type === 'fund'
                        ? `${found.name ?? symbol} is a fund. The label was picked from its name; change it if it’s wrong.`
                        : `FolioQ couldn’t check what ${symbol} is right now. Choose the label that fits.`}
                    </p>
                  </fieldset>
                )}
              </div>
            )}
            {(kind === 'crypto' || kind === 'metal') && symbol && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                It will be labelled <span className={pill}>{label}</span>
              </p>
            )}

            {/* Bought just now, or already owned: asked outright, as it changes where the cost comes from. */}
            {!isCash && (
              <fieldset>
                <legend className={fieldLabel}>How did you get it?</legend>
                <div role="radiogroup" aria-label="How did you get it?" className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(
                    [
                      { value: 'bought', text: 'I just bought it', hint: 'Priced at the market on the day you bought', Icon: ShoppingCart },
                      { value: 'owned', text: 'I already own it', hint: 'Enter your average cost from your broker', Icon: Receipt },
                    ] as const
                  ).map(({ value, text, hint, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={how === value}
                      onClick={() => {
                        setHow(value)
                        lookUpPrice({ ticker, assetClass, openedAt, how: value }, 0)
                      }}
                      className={card(how === value)}
                    >
                      <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${how === value ? 'text-mint-700 dark:text-mint-300' : 'text-zinc-500'}`} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-black dark:text-zinc-50">{text}</span>
                        <span className="mt-0.5 block text-xs leading-4 text-zinc-500 dark:text-zinc-400">{hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {(isCash || how !== null) && (
              <div key={`how-${how}`} className="rise-in flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                    <label htmlFor={`${uid}-${byMoney ? 'spend' : 'quantity'}`} className={fieldLabel}>
                      {isCash ? words.amount : bought ? 'How much did you buy?' : 'How much do you own?'}
                    </label>
                    {!isCash && (
                      <EnterBySwitch
                        value={enterBy}
                        onChange={(next) => {
                          setEnterBy(next)
                          setError('')
                        }}
                        unitsLabel={words.units}
                        moneyLabel={bought ? 'Money spent' : 'Total paid'}
                      />
                    )}
                  </div>
                  {byMoney ? (
                    <div key="money" className="rise-in flex flex-col gap-2">
                      <MoneyInput
                        id={`${uid}-spend`}
                        value={spend}
                        onChange={setSpend}
                        currency={bought ? spendCurrency : costCurrency}
                        currencies={bought ? (paying ? [payFrom] : moneyCurrencies(display)) : moneyCurrencies(display)}
                        onCurrency={bought ? setSpendChoice : setCostCurrency}
                        placeholder={kind === 'crypto' ? '500' : '1000'}
                      />
                      <p aria-live="polite" data-testid="units-worked-out" className="text-sm text-zinc-600 dark:text-zinc-400">
                        {!(spent > 0) ? (
                          bought ? (
                            `Enter what you paid and FolioQ works out how many ${words.unitsLower} at the price on that day.`
                          ) : (
                            `Enter what you paid in total and your average cost; FolioQ works out how many ${words.unitsLower}.`
                          )
                        ) : qty > 0 ? (
                          <>
                            {bought ? 'That buys about ' : 'That is '}
                            <span className="font-semibold tabular-nums text-black dark:text-zinc-50">
                              {formatShares(qty)} {words.unitsLower}
                            </span>
                            {bought && price !== null ? ` at ${formatMoney(price, money)} each.` : '.'}
                          </>
                        ) : bought && spendRate === null ? (
                          <span className={errorText}>
                            No {currencyName(spendCurrency)} exchange rate for that date. Choose US dollars.
                          </span>
                        ) : bought ? (
                          `How many ${words.unitsLower} follows once the price is found.`
                        ) : (
                          `Enter the average cost to work out how many ${words.unitsLower}.`
                        )}
                      </p>
                    </div>
                  ) : (
                    <input
                      key="units"
                      id={`${uid}-quantity`}
                      name="quantity"
                      required
                      type="number"
                      inputMode="decimal"
                      min="0.00000001"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder={kind === 'crypto' ? '0.25' : kind === 'metal' ? '2' : isCash ? '5000' : '10'}
                      className={field}
                    />
                  )}
                </div>

                {!isCash && !bought && (
                  <div className="flex flex-col gap-2">
                    <label htmlFor={`${uid}-cost`} className={fieldLabel}>
                      {words.cost}
                    </label>
                    {byMoney ? (
                      <MoneyInput
                        id={`${uid}-cost`}
                        value={cost}
                        onChange={setCost}
                        currency={costCurrency}
                        currencies={[costCurrency]}
                        onCurrency={setCostCurrency}
                        placeholder={kind === 'crypto' ? '60000' : kind === 'metal' ? '3500' : '150.00'}
                      />
                    ) : (
                      <div className="flex gap-2">
                        <input
                          id={`${uid}-cost`}
                          name="cost_basis"
                          type="number"
                          inputMode="decimal"
                          min="0.00000001"
                          step="any"
                          value={cost}
                          onChange={(e) => setCost(e.target.value)}
                          placeholder={kind === 'crypto' ? '60000' : kind === 'metal' ? '3500' : '150.00'}
                          className={field}
                        />
                        <CurrencySelect
                          label="Currency of the average cost"
                          value={costCurrency}
                          onChange={setCostCurrency}
                          options={moneyCurrencies(display)}
                        />
                      </div>
                    )}
                    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      {byMoney
                        ? 'From your broker or exchange, in the same currency as the total. '
                        : 'In any currency, as your broker or exchange shows it. Leave it blank if you don’t know it; gain is then left out. '}
                      {costCurrency !== 'USD' && 'It is converted to US dollars at the rate on the date opened.'}
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label htmlFor={`${uid}-opened`} className={fieldLabel}>
                    {isCash ? 'Held since' : bought ? 'Date bought' : 'Date opened'}
                  </label>
                  <input
                    id={`${uid}-opened`}
                    name="opened_at"
                    required
                    type="date"
                    max={today}
                    value={openedAt}
                    onChange={(e) => {
                      setOpenedAt(e.target.value)
                      lookUpPrice({ ticker, assetClass, openedAt: e.target.value, how }, 350)
                    }}
                    className={field}
                  />
                </div>

                {bought && (
                  <div aria-live="polite" data-testid="add-price" className="flex flex-col gap-3">
                    {quote.status === 'idle' ? (
                      <p className="text-sm text-zinc-500 dark:text-zinc-400">Enter what you bought to see its price on that date.</p>
                    ) : !market && !noMarketPrice ? (
                      <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                        <CalendarDays className="h-4 w-4 animate-pulse" aria-hidden="true" />
                        Finding the price…
                      </p>
                    ) : market ? (
                      <p
                        key={`${market.date}-${market.price}`}
                        data-testid="price-origin"
                        className="rise-in text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        <span className="font-semibold tabular-nums text-black dark:text-zinc-50">{shownPrice(market, money)}</span>{' '}
                        each: {market.basis === 'live' ? 'the live price now' : `the close on ${formatDayDate(market.date)}`},{' '}
                        <PriceOrigin market={market} />. This becomes its average cost.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {quote.status === 'done' && !quote.result.ok ? quote.result.error : ''}
                        </p>
                        <label htmlFor={`${uid}-manual`} className="text-sm text-zinc-700 dark:text-zinc-300">
                          Or enter the price you paid, in US$
                        </label>
                        <input
                          id={`${uid}-manual`}
                          type="number"
                          inputMode="decimal"
                          min="0.00000001"
                          step="any"
                          value={manualPrice}
                          onChange={(e) => setManualPrice(e.target.value)}
                          className={field}
                        />
                      </div>
                    )}

                    {cashLines.some((l) => l.amount > 0) && (
                      <CashSelect
                        id={`${uid}-pay`}
                        label="Pay with"
                        value={payFrom}
                        onChange={setPayChoice}
                        options={cashLines.filter((l) => l.amount > 0).map((l) => l.currency)}
                        lines={cashLines}
                        outside="Money from outside FolioQ"
                      />
                    )}

                    {costUsd !== null && (
                      <div className="rise-in rounded-2xl bg-zinc-100 px-4 py-3 text-sm dark:bg-white/[.05]">
                        <p className="flex items-center gap-2 text-black dark:text-zinc-50">
                          <Banknote className="h-4 w-4 shrink-0 text-mint-700 dark:text-mint-300" aria-hidden="true" />
                          <span>
                            It costs{' '}
                            <span className="font-semibold tabular-nums">
                              {paying && costInCash !== null ? inOwn(costInCash, payFrom) : formatMoney(costUsd, money)}
                            </span>
                            {paying && !shortOfCash && `, from ${currencyName(payFrom)} cash`}
                          </span>
                        </p>
                        {shortOfCash ? (
                          <p className={`mt-2 ${errorText}`}>
                            This portfolio has {inOwn(line?.amount ?? 0, payFrom)} in {currencyName(payFrom)} cash. Buy less, or pay
                            another way.
                          </p>
                        ) : paying && costInCash !== null ? (
                          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
                            Cash left afterwards:{' '}
                            <span className="font-medium tabular-nums">{inOwn(Math.max(0, (line?.amount ?? 0) - costInCash), payFrom)}</span>
                          </p>
                        ) : !paying ? (
                          <p className="mt-2 text-zinc-600 dark:text-zinc-400">Your cash in FolioQ stays as it is.</p>
                        ) : null}
                      </div>
                    )}
                    <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                      Prices are estimates from public market data and may differ from the price you actually got.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* In the chat, exactly what will be recorded, right above Confirm. */}
          {chat && ready && (
            <p data-testid="action-summary" className="rise-in rounded-2xl border border-mint-600/30 bg-mint-600/[.06] px-4 py-3 text-sm leading-6 text-black dark:border-mint-400/30 dark:bg-mint-400/[.08] dark:text-zinc-50">
              {describe('future')}
            </p>
          )}

          {error && (
            <p role="alert" className={errorText}>
              {error}
            </p>
          )}

          <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {chat ? (
              <button type="button" onClick={onCancel} disabled={pending} className={outlineButton}>
                Cancel
              </button>
            ) : (
              <DialogClose className={outlineButton}>Cancel</DialogClose>
            )}
            <button type="submit" disabled={pending || !ready} className={primaryButton}>
              {pending ? 'Saving…' : chat ? 'Confirm' : bought ? 'Add purchase' : isCash ? 'Add cash' : 'Add holding'}
            </button>
          </div>
        </form>
  )
}

function kindChosenAtStart(chat: boolean, kind: AssetKind | undefined): boolean {
  return !chat || kind !== undefined
}

/** The Add a holding button and its dialog. The form inside starts fresh each time it opens. */
export default function AddHoldingDialog({
  portfolioId,
  today,
  assetTypes = true,
  cashLines,
  triggerClassName = primaryButton,
}: {
  portfolioId: string
  /** Today's market date, YYYY-MM-DD, from the server. */
  today: string
  /** False until supabase/assets.sql has been run: only stocks can be added. */
  assetTypes?: boolean
  cashLines: CashLine[]
  triggerClassName?: string
}) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClassName}>Add a holding</DialogTrigger>
      <DialogContent className={`${dialogPanel} max-h-[calc(100dvh-2rem)] overflow-y-auto`}>
        <DialogTitle className="text-2xl text-black dark:text-zinc-50">Add a holding</DialogTitle>
        <DialogDescription className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
          Record something this portfolio holds. FolioQ keeps the record; it doesn&apos;t place orders.
        </DialogDescription>
        <AddHoldingForm
          portfolioId={portfolioId}
          today={today}
          assetTypes={assetTypes}
          cashLines={cashLines}
          onDone={(done) => {
            setOpen(false)
            toast(done.toast)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
