# FolioQ

A portfolio tracker for people who manage money on behalf of others. Each portfolio lists what it holds and, for every holding, a written thesis: the claim, the assumptions it rests on, and the risks. An AI assistant can draft a thesis and answer questions about the portfolio, and each portfolio can be shared through a read-only link.

Built with Next.js 16 (App Router), Supabase (auth and Postgres), Finnhub (market data), and Gemini (thesis drafts and the assistant).

## Setup

### 1. Install

```bash
npm install
```

### 2. Environment variables

Create `.env.local` in the project root:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser and server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: share links and saving prices |
| `FINNHUB_API_KEY` | Quotes, company profiles, ticker search, news |
| `GEMINI_API_KEY` | AI thesis drafts and the portfolio assistant |
| `GEMINI_MODEL` | Optional. Tried first, before the built-in fallbacks |
| `CRON_SECRET` | Protects `/api/cron/prices` |

### 3. Database

The app runs on five tables: `portfolios`, `holdings`, `theses`, `messages`, and `prices`.

Open the Supabase SQL editor, paste the contents of [`supabase/setup.sql`](supabase/setup.sql), and run it. It leaves the tables as they are and only:

- adds `portfolios.share_token`, which share links need
- turns on row level security with owner-only policies (prices are readable by any signed-in user and written only by the server)
- lists every policy on the five tables when it finishes, so you can spot any leftover one

It is safe to run more than once. Until it has been run, creating a portfolio fails with a message pointing back to this file.

Then run `supabase/sharing.sql` the same way. It adds what sharing a portfolio with another account needs: a `profiles` table (each account's share ID and display name), a `portfolio_members` table (who a portfolio is shared with, as viewer or editor, and whether they accepted), the extra access rules for those people, and the functions the app calls. Nothing existing is dropped. Until it has been run the app works as before and says so wherever sharing with people would appear.

Then run `supabase/assets.sql`. It adds one column, `holdings.asset_class`, so a portfolio can hold crypto, gold and silver, and cash, and so funds can be grouped as bonds, property, or commodities. Existing holdings become stocks. Until it has been run only stocks can be added.

Then run `supabase/chats.sql`. It adds one column, `messages.chat_id`, so a portfolio can keep several assistant chats; conversations saved before it become each portfolio's first chat. No table is added. Until it has been run there is one conversation per portfolio, as before.

Then run `supabase/history.sql`. It adds one table, `holding_history`, so each holding keeps a record of how it got to where it is, and gives every existing holding a starting entry as it stands. Until it has been run, holdings work as before and their History panel says to run this file. **Run it again after updating FolioQ**: it brings an existing table up to date (new kinds of entry, the `cash_currency` column) without touching the entries in it.

Then run `supabase/edits.sql`. It lets owners and editors correct a past purchase, sale, or opening entry, with the database keeping each earlier version (see "Holding history"). It also adds `holding_history.purpose`, so cash added can say where it came from, and cash taken out what it was for. Until it has been run, saving an edit says to run this file and changes nothing.

Then run `supabase/exchanges.sql`. It adds two columns and no table: `holdings.exchange` (the exchange a coin is priced on; null, as every existing holding stays, means the automatic choice) and `holding_history.traded_at` (the moment a trade filled, when a time was given). Until it has been run, a time given with a trade still prices it at that moment but isn't kept in the history, and choosing an exchange other than Automatic says to run this file.

In **Authentication → Sign In / Providers → Email** set the minimum password length to 8, require lowercase, uppercase, digits, and symbols, and turn on **Require current password when updating**. The app enforces all of this itself, but setting it in Supabase too means it holds even for a request that doesn't come from the app. Supabase skips the current-password check in the same two cases the app does: an account that has no password yet, and a session that began from a reset email.

### 4. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests for the portfolio maths (`lib/portfolio.ts`) |

## How the data is used

| Table | Meaning in the app |
| --- | --- |
| `portfolios` | One per pot of money. `mandate` is the "What is it for?" text. `share_token` is set while sharing is on. |
| `holdings` | One row per thing held per portfolio. `asset_class` (from `supabase/assets.sql`) says what it is: `stock`, `bond`, `property`, `commodity` (a US-listed ticker, grouped), `crypto` (a coin such as BTC), `metal` (`XAU` gold or `XAG` silver), or `cash` (a currency code). `quantity` is shares, coins, troy ounces, or the cash amount; `cost_basis` is the **average cost per unit in USD** (optional, null for cash); `opened_at` is when it was opened. |
| `theses` | One row per saved version of a holding's thesis. `assumptions` and `risks` are JSON arrays of strings. `author_edited` is `false` only when an AI draft was saved without changes. |
| `messages` | The assistant's chats for a portfolio. `role` is `user` or `assistant`; `chat_id` groups the messages of one chat. A chat has no row of its own: its title is its first question, and deleting it deletes its messages. |
| `prices` | One closing price per ticker per market day, shared by all users. Feeds the value-over-time chart. |
| `holding_history` | (from `supabase/history.sql`) One row each time a holding is opened, bought more of, sold, corrected by hand, or removed: the date, amount, price and where it came from, the average cost before, the US dollars it moved in or out of cash, and who did it. Keyed by asset (`asset_key`, the same key as `prices`), not by holding row, so selling everything and buying back later keeps one history. Readable by anyone with access to the portfolio; owners and editors can add entries in their own name; nobody can change or delete one. |

## How it fits together

- **`lib/portfolio.ts`** — pure functions that value holdings against quotes, total them up, and build the value history from stored closes. Covered by `lib/portfolio.test.mjs`.
- **`lib/data.ts`** — loads rows from Supabase, fetches quotes and company profiles, and builds what the pages render. Used by both the owner's pages and shared links.
- **`lib/finnhub.ts`** — market data. Failures degrade to "price unavailable" rather than breaking a page.
- **`lib/gemini.ts`** — thesis drafts (structured JSON) and assistant replies. Each call falls back through a short list of models, because the free tier is often briefly overloaded.
- **`lib/assistant-sources.ts`** and **`lib/assistant-format.ts`** — what the assistant may draw on and how answers cite it. Its only outside information is Finnhub market data and the past week's headlines from the publishers in `TRUSTED_PUBLISHERS`; edit that list to change who counts. The model cites by number, and the server checks those numbers against what it was actually given and writes the "Sources" list itself, so a link can never come from the model. Covered by `lib/assistant-format.test.mjs`.
- **The portfolio's purpose** (`portfolios.mandate`, the "What is it for?" field) is what the assistant reads every question through: it judges concentration and theses against it and flags limits it sets. Where it is blank, the home page, the portfolio page, and the assistant tab each ask for it.
- **`app/dashboard/actions.ts`** — every mutation as a server action. Each one re-checks the session; row level security does the rest.
- **`app/dashboard`** — the signed-in app, framed by a sidebar (`app/components/app/app-frame.tsx`). `/dashboard` is the home page (total you answer for, a question box for the assistant, each portfolio's record checklist, and what is waiting on you); `/dashboard/portfolios` lists them; `/dashboard/research` is ticker lookup inside the app. **`app/share/[token]`** — the read-only shared view, served with the service role after matching the token.
- **`app/api/cron/prices`** — saves the closing price of every held ticker.
- **`proxy.ts`** — refreshes the Supabase session on each request (Next.js 16's name for middleware) and enforces who may open what. See "Who can open what" below.
- **`app/components/motion`** — the interactive behaviour (shake on hover, lean toward the pointer, drag and spring back), built on the `motion` library and switched off when the device asks for reduced motion.

## Who can open what

The rules live in one place, `lib/routes.ts`, and `proxy.ts` applies them before a page renders:

| Visitor | Asks for | Gets |
| --- | --- | --- |
| Signed in | `/login`, `/signup`, `/forgot-password` | Redirected to `/dashboard` |
| Signed out | `/dashboard/…`, `/account` | Redirected to `/login?next=…`, then returned to the page they wanted after logging in |
| Signed in | `/research`, `/research/[symbol]` | Redirected to the same page under `/dashboard/research`, so they stay in the app |
| Anyone | Public pages, `/share/[token]` | The page |

Each of those pages and layouts checks the session again itself, and every server action does too, so the proxy is the first check rather than the only one. `next` only ever accepts a path on this site.

Public pages are static, so they can't know on the server who is looking. A small inline script (`app/components/session.tsx`) sets `data-session` on `<html>` before first paint when a Supabase session cookie is present, and CSS swaps "Create an account" style prompts for "Open your portfolios". That only decides what is shown; it grants nothing.

### Terms and privacy

`/terms` is the page the sign-up checkbox links to. Set `CONTACT_EMAIL` in `lib/site.ts` to show a contact address and the account-deletion instructions on it, and bump `TERMS_UPDATED` whenever the wording changes.

### Passwords

Rules (in `lib/credentials.ts`, covered by `lib/credentials.test.mjs`): at least 8 characters with a lowercase letter, a capital, a number, and a symbol. Sign-up also checks the email is well formed.

Changing a password in account settings goes through one server action (`app/account/actions.ts`):

| The account… | Is asked for |
| --- | --- |
| has a password | the current password, then the new one twice |
| has never had one (signed up with Google) | the new one twice |
| just arrived through a reset email | the new one twice |

Saving signs the account out on every device and sends the person to log in again. An account that began with Google can log in with email and password as well once a password has been set this way. "Arrived through a reset email" is remembered in a short-lived cookie signed with the service role key (`lib/recovery.ts`), set only by `/auth/callback` and `/auth/confirm`, so adding `?reset=1` to the address by hand skips nothing.

### Password reset

`/forgot-password` emails a reset link that returns to `/auth/callback?next=/account?reset=1`, where the person chooses a new password. For this to work, add `https://<your site>/**` (and `http://localhost:3000/**` for development) to **Authentication → URL Configuration → Redirect URLs** in Supabase.

## Kinds of holding

Defined in `lib/assets.ts` (covered by `lib/assets.test.mjs`), priced in `lib/asset-prices.ts`. All sources are free and, apart from Finnhub, need no key.

| Kind | What you enter | Price source | "Today" means |
| --- | --- | --- | --- |
| Stock or fund | A market (the US or one of 40 others) and a ticker. A company is a Stock (a REIT a Property company); a fund is a Stock, Bond, Property or Commodity fund | Finnhub for the US; Yahoo Finance elsewhere, in the market's currency, converted at the live rate | Since the previous close |
| Crypto | A coin symbol (BTC), a number of coins, and optionally the exchange it was bought on | That exchange; otherwise Coinbase Exchange, Kraken as backup | The last 24 hours (crypto never closes) |
| Gold or silver | `XAU` or `XAG` and troy ounces | gold-api.com | Since the last price FolioQ saved on an earlier day |
| Cash | A currency and an amount | The exchange rates under "Display currency" | Since the last saved day (US dollars never move) |

**Every holding carries a label** (`assetLabel`): Stock, Stock fund, Bond fund, Property company or fund, Commodity fund, Crypto, Precious metal, or Cash. It always fits what the holding is: crypto, metals and cash are fixed by their kind, and for a listed ticker Finnhub's symbol search says whether it is a company (`Common Stock`, `ADR`…), a REIT, or a fund (`ETP`) (`listingTypeOf`, falling back to the company profile when the search is rate limited). A company can only be a Stock and a REIT only Property (`allowedGroups`, enforced on the server by `fittingGroup`); a fund starts in the group its name suggests (`guessFundGroup`: "bond", "real estate", "gold"…) and can be moved between fund groups.

**Where it was bought** (`lib/venues.ts`, covered by `lib/venues.test.mjs`).

- *Shares abroad.* Add a holding asks for the market first (`MarketPicker` in `trade-time.tsx`). Outside the US the ticker is stored with Yahoo Finance's suffix for that market, so DBS on SGX is `D05.SI` and the market needs no column (`tickerOn`, `marketOf`). Search, what a ticker is, its name and industry, and its live price come from Yahoo Finance (`lib/yahoo.ts`), because Finnhub's free plan covers the US only. Prices are in the market's own currency (London's pence, Johannesburg's cents and Tel Aviv's agorot are turned into whole units) and converted to US dollars at the live rate; a purchase on an earlier day at that day's rate. Only markets whose currency FolioQ has an exchange rate for are offered (41, listed in `STOCK_MARKETS`).
- *Crypto exchanges.* A coin can be priced on the exchange it was bought on (`holdings.exchange`): Coinbase, Kraken, Binance, OKX, Bybit, Bitget, KuCoin, Gate, MEXC, HTX, Crypto.com, Bitstamp, Bitfinex, Gemini, Upbit, Bithumb, bitFlyer, Indodax, Independent Reserve (SGD, AUD, NZD) and Luno (MYR, IDR, ZAR). All have free public feeds without a key; each was checked live against BTC and AVAX. The picker (`ExchangePicker`) lists only the exchanges that trade the coin, each with its price there now (`venuesFor` in `lib/venue-prices.ts`); exchanges that don't answer stay in the list, marked. The holding is then valued at that exchange's price and its own 24-hour change (`withVenueQuotes`), credited as, for example, "Binance, BTC/USDT". An exchange's quote currency is turned into US dollars: USDT at USDT's own price (Kraken live, Coinbase at a past moment; about US$0.999), anything else at the exchange rate. If the exchange doesn't answer, the automatic price stands. The daily prices FolioQ saves stay the automatic ones, so the chart's history is the same whichever exchange is chosen. Change it under More → Edit details.

Prices are stored under a key (`priceKey`): the ticker for listed holdings, `CRYPTO:BTC`, `METAL:XAU`, `CASH:SGD` for the rest, so the coin BTC and the fund whose ticker is BTC never share a price. The nightly job saves every kind; crypto, metals, and cash are filed under the same day as the stocks' close. The portfolio page adds a "By asset type" breakdown once there is more than one kind.

## Buying, selling, and cash

Each holding row has **Buy**, **Sell**, and **More** (⋯): Edit details, Fix a mistake, Delete (`app/dashboard/[id]/holding-menu.tsx`). On phones each holding is a card with the same controls, rather than a table row scrolled off the edge.

- **The time an order filled.** Add a holding (when just bought), Buy and Sell take an optional time beside the date (`TimeField` in `trade-time.tsx`), in the person's own time zone; the browser turns date and time into one moment and the server checks it isn't in the future and matches the date (`readMoment`). With a time, the price is the one at that moment (`datedPrice`, `lib/bars.ts`): for a coin, its exchange's one-minute bars (Kraken: its individual trades, which go back years), else hourly, else daily; for shares, funds, gold and silver, Yahoo Finance by the minute for 30 days, by five minutes for 60, by the hour for two years, then the day's close. If nothing traded at that moment (a market shut for the night) it is the last trade before, and the form says so; the form also shows the range traded in that minute or hour. Exchanges that keep no past prices by the minute (bitFlyer, Luno; Independent Reserve beyond ten days) fall back to Coinbase or Kraken, and the form says that too. The moment is kept in `holding_history.traded_at` and shown in the History panel; entries on the same day are ordered by it.
- **Sell and Buy** share one dialog (`trade-dialog.tsx`; `sellHolding` and `buyMore` in `app/dashboard/actions.ts`, arithmetic in `planSale` and `planBuy` in `lib/portfolio.ts`). They take how much and **the date** (and optionally the time), never a typed price: the server looks the price up (`lib/dated-price.ts`, date rules and parsing in `lib/sale-date.ts`): the live price for today, otherwise that day's close, or the last close within six days before it if markets were shut. Closes come from Yahoo Finance's public chart endpoint for shares and funds, Yahoo's COMEX futures (`GC=F`, `SI=F`) for gold and silver, and Coinbase then Kraken daily candles (UTC days) for crypto, all free and keyless; if none answers, from the `prices` table. Yahoo's endpoint is unofficial and can be slow: its two hosts are asked together with an 8-second limit, and past days are cached for a day, so the preview and the trade share one lookup. **Only when no source has a price** can one be typed in; the history marks it as entered by hand.
- **Cash in any currency.** A sale's money goes into the cash line chosen (the display currency by default), and a purchase can be paid from any cash line with money in it (or from outside FolioQ). The US-dollar amount is converted at that day's rate (`getRateOn` in `lib/fx.ts`: live for today, the ECB reference rate via Frankfurter for earlier days). The money moves first and is put back if the holding can't be updated; a purchase the cash doesn't cover is refused; spending a line to the last cent removes it. All cash movement goes through `moveCash`.
- **Add money / Take money out** on the Cash card (`cash-dialog.tsx`, `moveMoney`) record deposits and withdrawals in any currency, on a date.
- **Add a holding** (`add-holding-dialog.tsx`) first asks what it is, then, for anything but cash, **"I just bought it"** (priced from the date bought, payable from cash) or **"I already own it"** (the average cost from your broker, typed in any currency and converted at the rate on the date opened). Something already owned can take the time it was bought too: it is kept in the history, and the form shows the market price at that moment with **Use as my average cost**, which fills the cost in (in the cost's currency) for anyone without their broker's figure. Adding something already held points to Buy on its row; cash already held, to Add money.
- **By number or by money.** A switch beside "How much?" (`amount-choice.tsx`) lets a purchase (in Add a holding and in Buy) be entered as **money spent** instead of shares or coins. The money is in the paying cash line's currency, or else any currency. Average costs, in Add a holding and in Fix a mistake, can also be in any currency. The currency box beside an amount is `CurrencySelect`: it shows the code, and the list that opens gives every currency's name, yours first, then US dollars. The server works out how many (`unitsForSpend` in `actions.ts`, `unitsForMoney` in `lib/portfolio.ts`, to 8 decimal places) at the same price it records, so the cost on record is the amount typed, and paying from cash takes exactly that amount out. Something already owned can be entered as **total paid** and average cost; the number held is total ÷ average cost.
- **Edit details** changes only a fund's group, a coin's exchange, and the date opened. **Fix a mistake** changes the amount or average cost, says it is only for corrections, and is recorded in the history as one. **Delete** removes a holding without recording a sale.
- Deleting the portfolio itself is inside the portfolio's **Edit details** dialog.

Cash has its own section on the portfolio page, and the totals there and on the home page are split into invested and cash.

**How live prices are.** The portfolio page refetches every minute while it is open. Live prices (Finnhub for shares, Coinbase then Kraken for crypto, gold-api.com for metals, and the live exchange rates) are fetched uncached and reused in memory for 45, 15, 15 and 60 seconds (`lib/fresh.ts`). When a source doesn't answer, the holding shows FolioQ's last saved price, labelled as such, and that fallback is never saved again as a new day's price. They don't use Next's `revalidate` cache, which serves the stored copy first once it is out of date, so a page opened after a quiet spell would show an old price. A figure can still differ slightly from another app's: each exchange has its own price, and a converted figure depends on the exchange rate used.

**Prices quoted in your currency, and naming every source.** FolioQ works in US dollars underneath. When another display currency is chosen, a coin is priced directly in that currency wherever an exchange FolioQ uses trades it there (`lib/direct-prices.ts`; which exchanges per currency is `DIRECT_CRYPTO` in `lib/price-sources.ts`):

| Currency | Exchanges |
|---|---|
| EUR | Coinbase, Kraken |
| GBP | Coinbase, Kraken, Luno |
| AUD | Kraken, Independent Reserve, Luno |
| CAD, JPY, CHF | Kraken |
| INR | Coinbase |
| SGD, NZD | Independent Reserve |
| MYR, IDR, ZAR | Luno |

- **Which price:** the middle of the market's best bid and offer, used only when the two are within 2% of each other (`midPrice`) and the result is within 5% of the US-dollar price converted (`believable`). Otherwise the converted price stands.
- **How it's stored:** the price is kept as its US-dollar equivalent at the display rate, so it shows exactly as quoted. Its 24-hour change is the US-dollar market's.
- **Not listed:** a pair an exchange doesn't trade is remembered for six hours.
- **Shares, funds, gold and silver** are always converted.
- **Saving and trades:** `prices` keeps US-dollar quotes only. Today's price for a trade uses the same direct quote and is recorded with its source and pair, e.g. "Independent Reserve (BTC/SGD)".

Every price names its source:
- **Holdings:** each one shows its price's source under the price, linked to it: the exchange and pair when quoted directly, else "in US$" when converted. Cash in another currency names the site of its rate.
- **The note under the figures** (`RateNote`) names all the sources, the conversion rate and its site, and which exchanges quote crypto directly in the chosen currency.
- **Elsewhere:** the Buy, Sell and Add dialogs say where today's price came from, or what it was converted from and at what rate. The chart, the sector breakdown, the research page and AI thesis drafts each name their sources.
- **The assistant** is given and cites the sources actually used (`gatherSources`).

Dialogs that save something close in the same React transition as the page refresh the action triggers (`startTransition` around `setOpen(false)` after the `await`), so a dialog stays on its saving state until the new numbers are on screen instead of closing over stale ones.

## Holding history

Every change to a holding adds an entry to `holding_history` (`logHistory` in `app/dashboard/actions.ts`): Add a holding records **opened** (with its price source when just bought), Buy records **bought**, Sell **sold**, Fix a mistake **corrected** (with the values before), Delete **removed**, and Add money / Take money out **deposited** / **withdrawn**. Each entry notes the cash it moved and in which currency (`cash_currency`). Writing it is best effort: the holding is the record of what is held, so a missing table never blocks a change. A live price is stored without a price date, so it is never described as a close.

On the portfolio page each holding row and each cash line has a **History** toggle that opens its entries under it, newest first (`app/components/portfolio/holding-history.tsx`; pure helpers and tests in `lib/history.ts`). Each cash line also lists the money trades moved through it: sale proceeds in, purchases paid from it out. Public share links don't show history.

**The value chart replays the history** (`positionTimeline` and `positionOn` in `lib/history.ts`, used by `buildHistory` in `lib/portfolio.ts`): each past day counts what was actually held then, buys, sales, deposits and withdrawals included, and assets sold out since still count while they were held. Without history it falls back to today's amounts from each opening date.

The value and gain shown are still one combined line per holding. Unrealized gain from the combined average cost equals the sum of each purchase's gain, so nothing is lost by combining.

**Editing an entry** (`edit-entry-dialog.tsx`, `editHistoryEntry` in `app/dashboard/actions.ts`, needs `supabase/edits.sql`). Owners and editors see **Edit** on each purchase, sale, and opening entry of a holding still held. The date, the time and the amount can be corrected, and for something already owned its average cost. A purchase or sale moved to another date or time is priced again there, the same way Buy and Sell price one (`getEntryPrice` previews it); left where it was, it keeps its price. The server replays the asset's entries before and after the change (`replayAsset` in `lib/history.ts`) and moves the holding by the difference (`holdingAfterEdit`): the amount, the total cost, and the date it started. Working from the difference, not the replay alone, keeps holdings whose history is incomplete correct. Purchases paid from cash, and sales paid into it, have that amount worked out again at the new figures, and the cash moves by the difference (refused if it doesn't cover it). Later sales have their gain measured again from the new average cost, marked "recalculated". Refused: an edit that makes a sale more than was held at the time, leaves none held (use Sell), or moves an entry across the holding's opening entry. Entries of something no longer held, corrections, removals and cash movements aren't editable.

The database keeps every edit honest (`keep_history_revision` in `supabase/edits.sql`): only the figures can change (amount, price, dates and time, cash moved, the cost a sale is measured against); before each change it copies the entry as it was into `revisions` and stamps `edited_at` and `edited_by` itself, and column grants stop anyone writing those directly. Entries still can't be deleted. The History panel shows "Edited by … on …" with how it read before. Tested in PGlite (15 checks), not against a live Supabase project.

**Notes on cash** (`PurposeField` in `cash-dialog.tsx`, `purpose-dialog.tsx`, `setEntryPurpose`; needs `supabase/edits.sql`). **Add money** (and Add a holding → Cash) asks "Where is it from?" and **Take money out** asks "What is it for?": optional free text up to 200 characters, with quick picks (Salary, Bonus, Dividend… / Rent, School fees, Holiday…). It is saved in `holding_history.purpose` and shown in the cash history as "From: …" or "For: …". Owners and editors can add or change it later with **Add source** / **Add purpose** on the entry; only the note changes, and the trigger keeps the earlier wording in `revisions` ("Source changed by … Before: …"). The assistant fills it in when the owner says it. Before edits.sql has been run, the money still moves and the person is told the note couldn't be kept. Tested in PGlite (5 more checks).

## Display currency

Everything is stored and calculated in US dollars, because that is what US-listed shares trade in. A person can choose another currency to *see* amounts in, under Account settings (the only place it is set); each amount is then multiplied by the current rate as it is printed. Percentages and the database are untouched, and costs are still entered in dollars.

- **Where the choice lives:** on the account (`user_metadata.currency`) so it follows the person between devices, and in a cookie so the same browser keeps it on public pages. No new tables.
- **Rates** (`lib/fx.ts`), both free and keyless: a live feed (fxratesapi.com, then Coinbase's public rates) reused for a minute, and the European Central Bank's daily reference rate via Frankfurter. The live figure is used only when it is within 5% of the ECB's (`pickRate` in `lib/currency.ts`); otherwise, or if no live source answers, the ECB rate is used. Wherever amounts are converted, a note says prices are live in US dollars, that converted figures are approximate, and names and links the site the rate came from. If nothing can be fetched, amounts stay in dollars and the page says so.
- **In components:** server components print `<Amount value={usd} />`; client components call `formatMoney(usd, useMoney())`. Pages without a `MoneyProvider` (the public marketing pages and their sample fund) show dollars.
- The assistant is given figures in the same currency the page shows.

## Assistant chats

Each portfolio can have any number of chats (the Assistant tab lists them, newest first). Within a chat the assistant is sent the last 20 messages of *that* chat, so it follows on from what was said; a new chat starts with no history. Chats are the owner's only: people a portfolio is shared with don't see them. A question asked from the home page, or with "Challenge it" on a thesis, starts a chat of its own.

Leaving the page doesn't stop an answer. The route (`app/api/assistant/route.ts`) finishes and saves it with `after()` even when nobody is listening any more. In the browser the answer is read by a store outside the chat panel (`app/components/app/answer-store.ts`), so it keeps arriving while the person moves around the app. A card in the corner (`answer-notice.tsx`) says it is being written and then that it is ready, with a link back. After a reload the chat says it is still writing and shows the answer once it is saved. Only one question per portfolio is answered at a time.

## Changing the portfolio through the assistant

The owner can tell the assistant what they did ("I bought 0.5 BTC today with my SGD cash", "I sold all my KO", "I want to add a holding") and it sets the change up as a card in the chat. It never makes the change itself.

- **The model proposes.** It has one tool, `record_change` (`RECORD_CHANGE` in `lib/chat-proposal.ts`, Gemini function calling). The system prompt (`CHAT_SYSTEM` in `lib/gemini.ts`) has it call the tool as soon as the owner asks, with only the details they stated, and never on its own initiative or because of anything in a thesis or a headline.
- **The server checks.** `proposalFrom` checks every field, drops anything doubtful, and looks the holding up in the portfolio:
  - Adding something already held becomes a purchase, and buying something not held becomes an addition.
  - A sale or removal of something not held becomes a one-line note instead of a card.
  - Cash in either direction becomes Add money or Take money out.

  The proposal is saved inside the answer as one line (`attachAction` in `lib/chat-actions.ts`); model text can never carry such a line (`stripMarkers`).
- **The owner confirms.** The card (`chat-action.tsx`) is the same form as the matching dialog. `AddHoldingForm`, `TradeForm` and `CashForm` were split out of their dialogs for this, with a `chat` mode.
  - It starts from what the owner said and asks for the rest with the dialog's own buttons and fields: kind, bought or owned, amount, date, cash.
  - Nothing is preselected that wasn't said.
  - It spells out exactly what will be recorded above **Confirm**. Removing a holding has a plain red confirm.
  - Saving uses the ordinary server actions, with all their checks.
- **The result is kept.** Confirm or Cancel saves a line in that chat (`recordChatOutcome`, `outcomeMessage`). The card then shows what was recorded, stays settled after a reload, and can't be confirmed twice. The assistant sees what became of each change next time.
- **Limits:** one change per message. With no holdings yet, the chat offers "I want to add a holding" and "I want to add money". Covered by `lib/chat-actions.test.mjs`.

## Sharing a portfolio

- **Link access** is private or public. Public means anyone with `/share/<token>` can view, signed in or not; switching back to private kills that link, and going public again issues a new one.
- **People** are invited by share ID (shown under Account, e.g. `FQ-7K3M-9X2P`). The owner types the ID, confirms the name it belongs to, and picks view-only or editor. The invite waits up to 7 days for an answer; one person can't be invited twice to the same portfolio.
- The invited person sees it under **Shared with me**, where they accept or decline, and can later remove it from their own list. The owner can change anyone's role or remove them from the Share dialog.
- **Editors** can add, change, and remove holdings and theses. Renaming or deleting the portfolio, sharing it, and the assistant conversation stay with the owner.
- **Live changes:** open pages listen to Supabase Realtime (`app/components/portfolio/live-sync.tsx`) and reload their data when a row they can see changes. If Realtime isn't available they still refresh once a minute.

The rules are enforced twice: in `supabase/sharing.sql` (row level security, plus functions that are the only way to create or accept an invite) and again in `app/dashboard/actions.ts`, where every action checks the caller's role before writing.

## Nightly prices

`vercel.json` schedules `/api/cron/prices` for 21:30 UTC on weekdays, after the US market close. On Vercel, set `CRON_SECRET` in the project's environment variables and Vercel sends it automatically. Anywhere else, call the endpoint from your own scheduler:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/prices
```

Opening a portfolio also saves that day's prices for its holdings, so the chart fills in during local development without the cron job.

## Known limits

- Shares listed outside the US are priced from Yahoo Finance's public endpoints, which are unofficial and can change or rate-limit without notice; the last saved price shows meanwhile. Markets whose currency FolioQ has no exchange rate for (Taiwan, Saudi Arabia, Vietnam and others) aren't offered. Mutual funds aren't covered.
- Limit and stop orders aren't tracked: FolioQ records trades, it doesn't place them. A limit order that filled is recorded like any trade, at the time it filled.
- Cash earns no interest in FolioQ: update the amount when it changes.
- Dividends and fees are not tracked. Each trade is kept in the holding's history, but the holding itself is one combined line at its average cost, and a sale's gain is measured against that average (not matched to particular earlier purchases, as a first-in-first-out tax report would).
- The value chart replays the holding history, but starts when an asset's closing prices were first saved: Finnhub's free plan has no historical prices to backfill from.
- A trade is recorded at the market price at the time given (or the day's close without one), not the exact price the broker filled at, so cash and gains are estimates; within a minute they are usually very close. Gold and silver use the futures price, which is close to but not the same as spot.
- One owner per portfolio; others get access as an editor or viewer by invite, or read-only through the share link.
- `/research` is public and uses the Finnhub key; responses are cached (quotes for 60 seconds) to stay within rate limits.
- AI answers depend on Gemini's free tier, which sometimes asks you to try again in a minute.
