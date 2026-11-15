-- FolioQ: holdings that aren't US stocks (crypto, gold and silver, cash),
-- and a label that groups ETFs as bonds, property, or commodities.
--
-- Run this after supabase/setup.sql. Paste the whole file into the Supabase
-- SQL editor and run it. It is safe to run more than once.
--
-- What it changes: one new column on the existing `holdings` table. Every
-- existing holding becomes 'stock', which is what it already was. No table is
-- added and nothing is dropped. The access rules on `holdings` (owners, and
-- editors a portfolio is shared with) already cover the new column.

alter table public.holdings
  add column if not exists asset_class text not null default 'stock';

-- Only these values. Added separately so running the script twice is harmless.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'holdings_asset_class_check'
      and conrelid = 'public.holdings'::regclass
  ) then
    alter table public.holdings
      add constraint holdings_asset_class_check
      check (asset_class in ('stock', 'bond', 'property', 'commodity', 'crypto', 'metal', 'cash'));
  end if;
end;
$$;

comment on column public.holdings.asset_class is
  'stock, bond, property, commodity: a US-listed ticker (the last three are how an ETF is grouped). '
  'crypto: a coin symbol such as BTC. metal: XAU (gold) or XAG (silver), quantity in troy ounces. '
  'cash: a currency code such as SGD, quantity is the amount.';
comment on column public.holdings.cost_basis is
  'Average cost per unit (share, coin, or troy ounce), in USD. Null for cash.';

-- Check: how many holdings of each kind there are now.
select asset_class, count(*) as holdings
from public.holdings
group by asset_class
order by asset_class;
