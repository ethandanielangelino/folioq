-- FolioQ: a history of every change to a holding.
--
-- Run this after supabase/setup.sql, sharing.sql and assets.sql. Paste the
-- whole file into the Supabase SQL editor and run it. It is safe to run more
-- than once, and running it again after FolioQ is updated brings the table up
-- to date without touching the entries already in it.
--
-- What it adds (nothing existing is dropped or rewritten):
--   1. holding_history   one row each time a holding is opened, bought more
--                        of, sold, corrected, or removed, and each time cash
--                        is deposited or withdrawn: when, how much, at what
--                        price and from where, the cash it moved, and who
--   2. access rules      anyone who can see the portfolio can read its
--                        history; owners and editors can add to it. Nobody
--                        can change or delete a row, so the record stays true
--   3. a starting entry  for every holding that already exists, so no history
--                        starts empty
--
-- The holdings themselves stay the source of truth for what is held now; this
-- table only records how they got there. Rows are kept by asset, not by
-- holding row, so selling everything and buying back later keeps one story.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.holding_history (
  id               uuid primary key default gen_random_uuid(),
  portfolio_id     uuid not null references public.portfolios (id) on delete cascade,
  -- Which asset: the ticker for listed holdings, CRYPTO:BTC, METAL:XAU, CASH:USD for the rest.
  asset_key        text not null,
  ticker           text not null,
  asset_class      text not null,
  kind             text not null,
  -- opened: the amount held; bought / sold: the amount traded;
  -- corrected: the amount held afterwards; removed: 0.
  quantity         numeric not null check (quantity >= 0),
  -- US dollars per unit: the trade's price, or for opened and corrected the
  -- average cost. Null when it isn't known (and always for cash).
  price            numeric check (price is null or price > 0),
  -- The trading day the price is from, when it was looked up from a date.
  price_date       date,
  -- Where the price came from (Yahoo Finance, Coinbase, ...). Null when it was typed in.
  price_source     text,
  -- What was held before: the average cost (to work out a sale's gain, or
  -- show a correction) and the amount (corrections and removals).
  cost_basis       numeric,
  quantity_before  numeric,
  -- The date it happened, as the person gave it.
  trade_date       date not null,
  -- Money into (+) or out of (-) the portfolio's cash, in cash_currency.
  cash_change      numeric not null default 0,
  -- True for the entries this script adds for holdings that existed already.
  before_history   boolean not null default false,
  created_by       uuid default auth.uid() references auth.users (id) on delete set null,
  -- The name shown beside the entry, kept as it was when the entry was made.
  actor_name       text,
  created_at       timestamptz not null default now()
);

-- Added after the first version of this script; harmless if already there.
alter table public.holding_history
  add column if not exists cash_currency text not null default 'USD';

-- Which kinds of entry there are. Replaced rather than added, so running this
-- script again after an update picks up new kinds (deposits and withdrawals).
alter table public.holding_history drop constraint if exists holding_history_kind_check;
alter table public.holding_history
  add constraint holding_history_kind_check
  check (kind in ('opened', 'bought', 'sold', 'corrected', 'removed', 'deposited', 'withdrawn'));

create index if not exists holding_history_portfolio_idx
  on public.holding_history (portfolio_id, asset_key, trade_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Access: read with the portfolio, add as owner or editor, never change
-- ---------------------------------------------------------------------------

alter table public.holding_history enable row level security;

drop policy if exists "People with access read history" on public.holding_history;
create policy "People with access read history"
  on public.holding_history
  for select
  to authenticated
  using (public.portfolio_role(portfolio_id) is not null);

drop policy if exists "Owners and editors add history" on public.holding_history;
create policy "Owners and editors add history"
  on public.holding_history
  for insert
  to authenticated
  with check (
    public.portfolio_role(portfolio_id) in ('owner', 'editor')
    and created_by = (select auth.uid())
  );

-- No update or delete policy: entries can't be edited or removed. Deleting a
-- portfolio still removes its history (the foreign key cascades).
grant select, insert on public.holding_history to authenticated;
grant all on public.holding_history to service_role;

-- ---------------------------------------------------------------------------
-- 3. Starting entries for holdings that already exist
--    One "opened" entry each, as the holding stands now, marked as recorded
--    before history was kept. Skipped for any asset that already has history,
--    so running the script again adds nothing.
-- ---------------------------------------------------------------------------

insert into public.holding_history
  (portfolio_id, asset_key, ticker, asset_class, kind, quantity, price, trade_date,
   before_history, created_by)
select
  h.portfolio_id,
  case h.asset_class
    when 'crypto' then 'CRYPTO:' || h.ticker
    when 'metal'  then 'METAL:'  || h.ticker
    when 'cash'   then 'CASH:'   || h.ticker
    else h.ticker
  end,
  h.ticker,
  h.asset_class,
  'opened',
  h.quantity,
  case when h.asset_class = 'cash' or h.cost_basis <= 0 then null else h.cost_basis end,
  h.opened_at,
  true,
  null
from public.holdings h
where not exists (
  select 1 from public.holding_history e
  where e.portfolio_id = h.portfolio_id
    and e.asset_key = case h.asset_class
      when 'crypto' then 'CRYPTO:' || h.ticker
      when 'metal'  then 'METAL:'  || h.ticker
      when 'cash'   then 'CASH:'   || h.ticker
      else h.ticker
    end
);

-- ---------------------------------------------------------------------------
-- Check: entries per kind, and the access rules. Expect 2 policies
-- (read, add) and an "opened" count equal to your number of holdings.
-- ---------------------------------------------------------------------------

select kind, count(*) as entries
from public.holding_history
group by kind
order by kind;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'holding_history'
order by policyname;
