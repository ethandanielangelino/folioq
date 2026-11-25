-- FolioQ: editing a purchase, a sale, or an opening entry after it was recorded,
-- with every edit kept; and a purpose for money taken out of cash.
--
-- Run this after supabase/history.sql (and exchanges.sql, though it adds the
-- one column it needs from there if that hasn't been run). Paste the whole
-- file into the Supabase SQL editor and run it. It is safe to run more than once.
--
-- Until now no entry in holding_history could be changed. This lets owners
-- and editors correct one (a wrong date, time, or amount), but never quietly:
--   - only the figures can change: the amount, price, dates and time, the
--     cash it moved, and the average cost it was measured against. What the
--     entry is (which portfolio, which asset, a purchase or a sale), who made
--     it and when stay as they were; the database refuses anything else
--   - before each change the database itself copies the entry as it was into
--     `revisions`, and stamps when and by whom (`edited_at`, `edited_by`), so
--     the app can't skip it
--   - nothing can be deleted, as before
-- It also adds `purpose`: what money taken out of cash was for, in the
-- owner's words ("School fees", "Holiday"), so it can be read back later.
-- It can be added or changed afterwards, and earlier wordings are kept too.
-- Nothing existing is dropped or rewritten; existing entries are unedited.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.holding_history add column if not exists traded_at timestamptz;
alter table public.holding_history add column if not exists edited_at timestamptz;
alter table public.holding_history add column if not exists edited_by uuid references auth.users (id) on delete set null;
-- The name shown beside the edit, kept as it was when the edit was made.
alter table public.holding_history add column if not exists edited_name text;
-- 'recalculated' when only the average cost a sale is measured against was
-- reworked, because an earlier entry was edited.
alter table public.holding_history add column if not exists edit_note text;
-- Every earlier version, oldest first.
alter table public.holding_history add column if not exists revisions jsonb not null default '[]'::jsonb;
-- What money taken out was for. Optional; up to 200 characters.
alter table public.holding_history add column if not exists purpose text;

-- Added separately so running the script twice is harmless.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'holding_history_purpose_check'
      and conrelid = 'public.holding_history'::regclass
  ) then
    alter table public.holding_history
      add constraint holding_history_purpose_check
      check (purpose is null or char_length(purpose) between 1 and 200);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Each edit keeps the version before it
-- ---------------------------------------------------------------------------

create or replace function public.keep_history_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.portfolio_id is distinct from old.portfolio_id
     or new.asset_key is distinct from old.asset_key
     or new.ticker is distinct from old.ticker
     or new.asset_class is distinct from old.asset_class
     or new.kind is distinct from old.kind
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.before_history is distinct from old.before_history
     or new.actor_name is distinct from old.actor_name then
    raise exception 'Only the figures of a history entry can be edited.';
  end if;

  new.revisions := coalesce(old.revisions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'quantity', old.quantity,
    'price', old.price,
    'price_date', old.price_date,
    'price_source', old.price_source,
    'cost_basis', old.cost_basis,
    'quantity_before', old.quantity_before,
    'trade_date', old.trade_date,
    'traded_at', old.traded_at,
    'cash_change', old.cash_change,
    'purpose', old.purpose,
    'edited_at', old.edited_at,
    'edited_name', old.edited_name
  ));
  new.edited_at := now();
  new.edited_by := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists holding_history_keep_revision on public.holding_history;
create trigger holding_history_keep_revision
  before update on public.holding_history
  for each row execute function public.keep_history_revision();

-- ---------------------------------------------------------------------------
-- 3. Access: owners and editors may change the figures, nothing else
-- ---------------------------------------------------------------------------

drop policy if exists "Owners and editors correct history" on public.holding_history;
create policy "Owners and editors correct history"
  on public.holding_history
  for update
  to authenticated
  using (public.portfolio_role(portfolio_id) in ('owner', 'editor'))
  with check (public.portfolio_role(portfolio_id) in ('owner', 'editor'));

-- Only these columns can be changed by a signed-in person. The trigger fills in
-- revisions, edited_at and edited_by itself.
grant update (
  quantity, price, price_date, price_source, cost_basis, quantity_before,
  trade_date, traded_at, cash_change, edited_name, edit_note, purpose
) on public.holding_history to authenticated;

-- Still no delete policy: entries can't be removed.

-- ---------------------------------------------------------------------------
-- Check: the access rules. Expect 3 policies (read, add, correct).
-- ---------------------------------------------------------------------------

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'holding_history'
order by policyname;
