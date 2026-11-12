-- FolioQ: access rules and one extra column for the existing schema.
--
-- Your tables (portfolios, holdings, theses, messages, prices) stay exactly
-- as they are. This script only:
--   1. adds portfolios.share_token, which read-only share links need
--   2. turns on row level security and adds owner-only policies
--   3. removes the five older policies that the new ones duplicate
--   4. shows you every policy on the five tables when it finishes
--
-- Paste the whole file into the Supabase SQL editor and run it.
-- No table, column, or row is dropped, and it is safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1. Share links
-- ---------------------------------------------------------------------------

-- When set, anyone holding the link /share/<share_token> can view the
-- portfolio read-only. Null means sharing is off.
alter table public.portfolios
  add column if not exists share_token uuid unique;

-- The app treats cost_basis as a per-share figure; record that in the schema.
comment on column public.holdings.cost_basis is 'Average cost per share, in USD';

create index if not exists holdings_portfolio_id_idx on public.holdings (portfolio_id);
create index if not exists theses_holding_id_idx     on public.theses (holding_id, version);
create index if not exists messages_portfolio_id_idx on public.messages (portfolio_id, created_at);

-- ---------------------------------------------------------------------------
-- 2. Row level security
--    A signed-in user can only reach their own portfolios and whatever hangs
--    off them. Prices are shared reference data: readable by any signed-in
--    user, written only by the server (service role).
--    Share links are served by the app server with the service role key after
--    matching the token, so no anonymous access is granted here.
-- ---------------------------------------------------------------------------

alter table public.portfolios enable row level security;
alter table public.holdings   enable row level security;
alter table public.theses     enable row level security;
alter table public.messages   enable row level security;
alter table public.prices     enable row level security;

drop policy if exists "Owners manage their portfolios" on public.portfolios;
create policy "Owners manage their portfolios"
  on public.portfolios
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Owners manage their holdings" on public.holdings;
create policy "Owners manage their holdings"
  on public.holdings
  for all
  to authenticated
  using (
    exists (
      select 1 from public.portfolios p
      where p.id = holdings.portfolio_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.portfolios p
      where p.id = holdings.portfolio_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners manage their theses" on public.theses;
create policy "Owners manage their theses"
  on public.theses
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.holdings h
      join public.portfolios p on p.id = h.portfolio_id
      where h.id = theses.holding_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.holdings h
      join public.portfolios p on p.id = h.portfolio_id
      where h.id = theses.holding_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Owners manage their messages" on public.messages;
create policy "Owners manage their messages"
  on public.messages
  for all
  to authenticated
  using (
    exists (
      select 1 from public.portfolios p
      where p.id = messages.portfolio_id
        and p.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.portfolios p
      where p.id = messages.portfolio_id
        and p.user_id = (select auth.uid())
    )
  );

drop policy if exists "Signed-in users read prices" on public.prices;
create policy "Signed-in users read prices"
  on public.prices
  for select
  to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Grants (row level security above still decides which rows)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete
  on public.portfolios, public.holdings, public.theses, public.messages
  to authenticated;

grant select on public.prices to authenticated;

grant all
  on public.portfolios, public.holdings, public.theses, public.messages, public.prices
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Remove the older policies
--    The project already had one policy per table ("own portfolios", "own
--    holdings", "own theses", "own messages", "read prices"). They express
--    the same ownership rule as the policies above, so keeping both sets
--    only makes every query check two policies. Two differences are why the
--    newer set is the one kept:
--      - the older ones apply to every role, including visitors who are not
--        signed in; "read prices" in particular let anyone read the table
--      - the newer ones wrap auth.uid() in a subselect, which Postgres
--        evaluates once per query instead of once per row
-- ---------------------------------------------------------------------------

drop policy if exists "own portfolios" on public.portfolios;
drop policy if exists "own holdings"   on public.holdings;
drop policy if exists "own theses"     on public.theses;
drop policy if exists "own messages"   on public.messages;
drop policy if exists "read prices"    on public.prices;

-- ---------------------------------------------------------------------------
-- 4. Check: every policy on the five tables.
--    You should see exactly five rows, one per table, all for the
--    "authenticated" role. Any other row is a policy this script doesn't know
--    about; policies add up, so a permissive one (for example "using (true)"
--    on portfolios) would widen access.
-- ---------------------------------------------------------------------------

select tablename, policyname, cmd, roles, qual as using_expression, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('portfolios', 'holdings', 'theses', 'messages', 'prices')
order by tablename, policyname;
