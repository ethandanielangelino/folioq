-- FolioQ: sharing a portfolio with another account.
--
-- Run this AFTER supabase/setup.sql. Paste the whole file into the Supabase
-- SQL editor and run it. It is safe to run more than once.
--
-- What it adds (nothing existing is dropped or rewritten):
--   1. profiles            one row per account: its share ID and display name
--   2. portfolio_members   who a portfolio is shared with, as viewer or editor,
--                          and whether they have accepted
--   3. access rules        people who accepted can read the portfolio; editors
--                          can also change its holdings and theses
--   4. functions           the only way to look up a share ID, send an invite,
--                          answer one, or change a role
--   5. live updates        lets the app hear about changes as they happen
--
-- Your existing owner-only policies stay exactly as they are. The new
-- policies are additional: Postgres grants access if ANY policy allows it.

-- ---------------------------------------------------------------------------
-- 1. Profiles and share IDs
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  -- What someone types to share with this account, e.g. FQ-7K3M-9X2P.
  share_code   text not null unique,
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

-- Eight characters from an alphabet without look-alikes (no I, L, O, 0, 1).
create or replace function public.new_share_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw text;
  code text;
begin
  loop
    raw := '';
    for i in 1..8 loop
      raw := raw || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    code := 'FQ-' || substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
    exit when not exists (select 1 from public.profiles where share_code = code);
  end loop;
  return code;
end;
$$;

-- Returns the caller's profile, creating it the first time. Passing a name
-- keeps the display name in step with the one in account settings.
create or replace function public.ensure_profile(p_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  wanted text := left(coalesce(trim(p_name), ''), 80);
  mine public.profiles;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;

  select * into mine from public.profiles where id = me;

  if not found then
    insert into public.profiles (id, share_code, display_name)
    values (me, public.new_share_code(), wanted)
    on conflict (id) do nothing;
    select * into mine from public.profiles where id = me;
  elsif wanted <> '' and mine.display_name is distinct from wanted then
    update public.profiles set display_name = wanted where id = me
    returning * into mine;
  end if;

  return mine;
end;
$$;

-- New accounts get a profile straight away. A failure here must never block
-- a sign-up, so errors are swallowed; the app creates the row on demand.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.profiles (id, share_code, display_name)
    values (
      new.id,
      public.new_share_code(),
      left(coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
        ''
      ), 80)
    )
    on conflict (id) do nothing;
  exception when others then
    null;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- Accounts that already exist.
do $$
declare
  u record;
begin
  for u in
    select au.id, au.raw_user_meta_data as meta
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
  loop
    insert into public.profiles (id, share_code, display_name)
    values (
      u.id,
      public.new_share_code(),
      left(coalesce(
        nullif(trim(u.meta ->> 'full_name'), ''),
        nullif(trim(u.meta ->> 'name'), ''),
        ''
      ), 80)
    )
    on conflict (id) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Who a portfolio is shared with
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_members (
  id           uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  -- The person it is shared with.
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null check (role in ('viewer', 'editor')),
  -- 'pending' until they accept. Declining, leaving, or being removed deletes
  -- the row, and so does a pending invite that goes unanswered for 7 days.
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  invited_by   uuid not null references auth.users (id) on delete cascade,
  invited_at   timestamptz not null default now(),
  responded_at timestamptz,
  -- One row per person per portfolio: no duplicate invites.
  unique (portfolio_id, user_id)
);

create index if not exists portfolio_members_user_idx on public.portfolio_members (user_id, status);

-- ---------------------------------------------------------------------------
-- 3. Access rules
--    These helpers run with the definer's rights so that a policy on one
--    table can ask about another without the two policies calling each other
--    in a loop. Each one only ever answers for the signed-in caller.
-- ---------------------------------------------------------------------------

create or replace function public.owns_portfolio(p_portfolio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.portfolios
    where id = p_portfolio and user_id = auth.uid()
  );
$$;

-- 'owner', 'editor', 'viewer', or null when the caller has no access.
create or replace function public.portfolio_role(p_portfolio uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.portfolios
      where id = p_portfolio and user_id = auth.uid()
    ) then 'owner'
    else (
      select m.role from public.portfolio_members m
      where m.portfolio_id = p_portfolio
        and m.user_id = auth.uid()
        and m.status = 'accepted'
    )
  end;
$$;

-- The same question, asked from a thesis: what is my role on the portfolio
-- this holding belongs to?
create or replace function public.holding_role(p_holding uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.portfolio_role(h.portfolio_id)
  from public.holdings h
  where h.id = p_holding;
$$;

alter table public.profiles          enable row level security;
alter table public.portfolio_members enable row level security;

-- A profile is private to its owner. Other people's names are only ever
-- returned by the functions in section 4.
drop policy if exists "People read their own profile" on public.profiles;
create policy "People read their own profile"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- Membership rows can be seen and removed by the person they are about and
-- by the portfolio's owner. They are created and changed only through the
-- functions below, so nobody can accept on someone else's behalf or promote
-- themselves to editor.
drop policy if exists "Members and owners see memberships" on public.portfolio_members;
create policy "Members and owners see memberships"
  on public.portfolio_members
  for select
  to authenticated
  using (user_id = (select auth.uid()) or public.owns_portfolio(portfolio_id));

drop policy if exists "Members leave and owners remove" on public.portfolio_members;
create policy "Members leave and owners remove"
  on public.portfolio_members
  for delete
  to authenticated
  using (user_id = (select auth.uid()) or public.owns_portfolio(portfolio_id));

-- Anyone who accepted can read the portfolio and what hangs off it.
drop policy if exists "Members read shared portfolios" on public.portfolios;
create policy "Members read shared portfolios"
  on public.portfolios
  for select
  to authenticated
  using (public.portfolio_role(id) in ('viewer', 'editor'));

drop policy if exists "Members read shared holdings" on public.holdings;
create policy "Members read shared holdings"
  on public.holdings
  for select
  to authenticated
  using (public.portfolio_role(portfolio_id) in ('viewer', 'editor'));

drop policy if exists "Members read shared theses" on public.theses;
create policy "Members read shared theses"
  on public.theses
  for select
  to authenticated
  using (public.holding_role(holding_id) in ('viewer', 'editor'));

-- Editors can also add, change, and remove holdings and theses. They cannot
-- rename or delete the portfolio, change who it is shared with, or read the
-- owner's conversation with the assistant: those stay with the owner.
drop policy if exists "Editors change shared holdings" on public.holdings;
create policy "Editors change shared holdings"
  on public.holdings
  for all
  to authenticated
  using (public.portfolio_role(portfolio_id) = 'editor')
  with check (public.portfolio_role(portfolio_id) = 'editor');

drop policy if exists "Editors change shared theses" on public.theses;
create policy "Editors change shared theses"
  on public.theses
  for all
  to authenticated
  using (public.holding_role(holding_id) = 'editor')
  with check (public.holding_role(holding_id) = 'editor');

grant select on public.profiles to authenticated;
grant select, delete on public.portfolio_members to authenticated;
grant all on public.profiles, public.portfolio_members to service_role;

-- ---------------------------------------------------------------------------
-- 4. Functions the app calls
-- ---------------------------------------------------------------------------

-- Who a share ID belongs to. Returns no row when the ID does not exist.
create or replace function public.find_profile_by_code(p_code text)
returns table (display_name text, is_self boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)) as display_name,
    p.id = auth.uid() as is_self
  from public.profiles p
  join auth.users u on u.id = p.id
  where auth.uid() is not null
    and p.share_code = upper(trim(p_code));
$$;

-- Invites the account with this share ID. Answers with one word:
--   ok               invited; they have 7 days to accept
--   not_owner        the caller does not own the portfolio
--   bad_role         role was not 'viewer' or 'editor'
--   not_found        no account has that share ID
--   self             that is the caller's own ID
--   already_invited  an unanswered invite is still open
--   already_member   they already have access
create or replace function public.invite_to_portfolio(p_portfolio uuid, p_code text, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing public.portfolio_members;
begin
  if me is null or not public.owns_portfolio(p_portfolio) then
    return 'not_owner';
  end if;
  if p_role is null or p_role not in ('viewer', 'editor') then
    return 'bad_role';
  end if;

  select id into target from public.profiles where share_code = upper(trim(p_code));
  if target is null then
    return 'not_found';
  end if;
  if target = me then
    return 'self';
  end if;

  -- An invite nobody answered within 7 days no longer counts.
  delete from public.portfolio_members
  where portfolio_id = p_portfolio
    and user_id = target
    and status = 'pending'
    and invited_at < now() - interval '7 days';

  select * into existing from public.portfolio_members
  where portfolio_id = p_portfolio and user_id = target;
  if found then
    return case when existing.status = 'accepted' then 'already_member' else 'already_invited' end;
  end if;

  insert into public.portfolio_members (portfolio_id, user_id, role, invited_by)
  values (p_portfolio, target, p_role, me);
  return 'ok';
end;
$$;

-- The invited person accepts or declines. Answers: accepted, declined,
-- expired (more than 7 days old; the invite is removed), or not_found.
create or replace function public.respond_to_invite(p_member uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.portfolio_members;
begin
  select * into invite from public.portfolio_members
  where id = p_member and user_id = auth.uid() and status = 'pending';
  if not found then
    return 'not_found';
  end if;

  if invite.invited_at < now() - interval '7 days' then
    delete from public.portfolio_members where id = invite.id;
    return 'expired';
  end if;

  if p_accept then
    update public.portfolio_members
    set status = 'accepted', responded_at = now()
    where id = invite.id;
    return 'accepted';
  end if;

  delete from public.portfolio_members where id = invite.id;
  return 'declined';
end;
$$;

-- The owner switches someone between viewer and editor.
create or replace function public.set_member_role(p_member uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role is null or p_role not in ('viewer', 'editor') then
    return 'bad_role';
  end if;

  update public.portfolio_members m
  set role = p_role
  where m.id = p_member and public.owns_portfolio(m.portfolio_id);

  return case when found then 'ok' else 'not_found' end;
end;
$$;

-- For the owner: everyone a portfolio is shared with. Clears out invites
-- that expired, so the list never shows a dead one.
create or replace function public.portfolio_people(p_portfolio uuid)
returns table (
  member_id    uuid,
  display_name text,
  share_code   text,
  role         text,
  status       text,
  invited_at   timestamptz,
  expires_at   timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_portfolio(p_portfolio) then
    return;
  end if;

  delete from public.portfolio_members m
  where m.portfolio_id = p_portfolio
    and m.status = 'pending'
    and m.invited_at < now() - interval '7 days';

  return query
    select
      m.id,
      coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
      p.share_code,
      m.role,
      m.status,
      m.invited_at,
      case when m.status = 'pending' then m.invited_at + interval '7 days' end
    from public.portfolio_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.id = m.user_id
    where m.portfolio_id = p_portfolio
    order by m.invited_at;
end;
$$;

-- For the invited person: every portfolio shared with them, pending or
-- accepted, with the owner's name.
create or replace function public.shared_with_me()
returns table (
  member_id      uuid,
  portfolio_id   uuid,
  portfolio_name text,
  owner_name     text,
  role           text,
  status         text,
  invited_at     timestamptz,
  expires_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return;
  end if;

  delete from public.portfolio_members m
  where m.user_id = me
    and m.status = 'pending'
    and m.invited_at < now() - interval '7 days';

  return query
    select
      m.id,
      f.id,
      f.name::text,
      coalesce(nullif(p.display_name, ''), split_part(u.email, '@', 1)),
      m.role,
      m.status,
      m.invited_at,
      case when m.status = 'pending' then m.invited_at + interval '7 days' end
    from public.portfolio_members m
    join public.portfolios f on f.id = m.portfolio_id
    join auth.users u on u.id = f.user_id
    left join public.profiles p on p.id = f.user_id
    where m.user_id = me
    order by m.invited_at desc;
end;
$$;

-- Only signed-in people may call these.
revoke execute on function
  public.ensure_profile(text),
  public.find_profile_by_code(text),
  public.invite_to_portfolio(uuid, text, text),
  public.respond_to_invite(uuid, boolean),
  public.set_member_role(uuid, text),
  public.portfolio_people(uuid),
  public.shared_with_me(),
  public.owns_portfolio(uuid),
  public.portfolio_role(uuid),
  public.holding_role(uuid),
  public.new_share_code()
from public, anon;

grant execute on function
  public.ensure_profile(text),
  public.find_profile_by_code(text),
  public.invite_to_portfolio(uuid, text, text),
  public.respond_to_invite(uuid, boolean),
  public.set_member_role(uuid, text),
  public.portfolio_people(uuid),
  public.shared_with_me(),
  public.owns_portfolio(uuid),
  public.portfolio_role(uuid),
  public.holding_role(uuid)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Live updates
--    Adds the tables to Supabase's realtime feed so an open portfolio page
--    hears about a change the moment someone else makes it. Skipped quietly
--    if a table is already in the feed or the feed does not exist.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['portfolios', 'holdings', 'theses', 'portfolio_members'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then
      null;
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Check: every policy on the tables involved. Expect
--   holdings           3  (owner, members read, editors change)
--   portfolio_members  2
--   portfolios         2  (owner, members read)
--   profiles           1
--   theses             3
-- ---------------------------------------------------------------------------

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('portfolios', 'holdings', 'theses', 'profiles', 'portfolio_members')
order by tablename, policyname;
