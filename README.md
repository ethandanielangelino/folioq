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
| `holdings` | One row per ticker per portfolio. `quantity` is shares; `cost_basis` is the **average cost per share** (optional); `opened_at` is when the position was opened. |
| `theses` | One row per saved version of a holding's thesis. `assumptions` and `risks` are JSON arrays of strings. `author_edited` is `false` only when an AI draft was saved without changes. |
| `messages` | The assistant conversation for a portfolio. `role` is `user` or `assistant`. |
| `prices` | One closing price per ticker per market day, shared by all users. Feeds the value-over-time chart. |

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

## Display currency

Everything is stored and calculated in US dollars, because that is what US-listed shares trade in. A person can choose another currency to *see* amounts in, under Account settings (the only place it is set); each amount is then multiplied by the current rate as it is printed. Percentages and the database are untouched, and costs are still entered in dollars.

- **Where the choice lives:** on the account (`user_metadata.currency`) so it follows the person between devices, and in a cookie so the same browser keeps it on public pages. No new tables.
- **Rates** (`lib/fx.ts`), both free and keyless: a live feed (fxratesapi.com, then Coinbase's public rates) cached for a minute, and the European Central Bank's daily reference rate via Frankfurter. The live figure is used only when it is within 5% of the ECB's (`pickRate` in `lib/currency.ts`); otherwise, or if no live source answers, the ECB rate is used. Wherever amounts are converted, a note says prices are live in US dollars, that converted figures are approximate, and names and links the site the rate came from. If nothing can be fetched, amounts stay in dollars and the page says so.
- **In components:** server components print `<Amount value={usd} />`; client components call `formatMoney(usd, useMoney())`. Pages without a `MoneyProvider` (the public marketing pages and their sample fund) show dollars.
- The assistant is given figures in the same currency the page shows.

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

- US-listed stocks and ETFs only, in US dollars.
- Positions, not transactions: individual trades, realized gains, cash, dividends, and fees are not tracked.
- The value chart uses current share counts for every past day, and starts when a ticker's prices were first saved. Finnhub's free plan has no historical prices to backfill from.
- One owner per portfolio; everyone else is read-only through the share link.
- `/research` is public and uses the Finnhub key; responses are cached (quotes for 60 seconds) to stay within rate limits.
- AI answers depend on Gemini's free tier, which sometimes asks you to try again in a minute.
