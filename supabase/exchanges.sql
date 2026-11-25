-- FolioQ: the exchange a coin was bought on, and the time a trade filled.
--
-- Run this after supabase/setup.sql, assets.sql and history.sql. Paste the
-- whole file into the Supabase SQL editor and run it. It is safe to run more
-- than once.
--
-- What it changes (no table is added, nothing is dropped or rewritten):
--   1. holdings.exchange           the exchange a coin is priced on, such as
--                                  'binance' or 'upbit' (the ids are listed in
--                                  lib/venues.ts). Null, as every existing
--                                  holding stays, means FolioQ's automatic
--                                  choice: Coinbase, then Kraken.
--   2. holding_history.traded_at   the moment a purchase or sale happened,
--                                  when a time was given with the date. Null
--                                  for every existing entry, and whenever
--                                  only a date was given.
--
-- Shares listed outside the US need nothing here: their market is part of the
-- ticker (DBS on the Singapore Exchange is D05.SI).
--
-- The access rules already on both tables (owners, and editors a portfolio is
-- shared with, may add and change; history rows can't be changed or deleted
-- by anyone) cover the new columns.

alter table public.holdings
  add column if not exists exchange text;

-- A short lower-case id or nothing. Added separately so running the script twice is harmless.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'holdings_exchange_check'
      and conrelid = 'public.holdings'::regclass
  ) then
    alter table public.holdings
      add constraint holdings_exchange_check
      check (exchange is null or exchange ~ '^[a-z0-9-]{2,40}$');
  end if;
end;
$$;

comment on column public.holdings.exchange is
  'For crypto: the exchange it is priced on (an id from lib/venues.ts, such as binance or upbit). '
  'Null means the automatic choice: Coinbase, then Kraken.';

alter table public.holding_history
  add column if not exists traded_at timestamptz;

comment on column public.holding_history.traded_at is
  'The moment the purchase or sale happened, when a time was given with the date. '
  'The price was then looked up for that moment. Null when only the date was given.';

-- Check: both columns are there.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'holdings' and column_name = 'exchange')
    or (table_name = 'holding_history' and column_name = 'traded_at'))
order by table_name;
