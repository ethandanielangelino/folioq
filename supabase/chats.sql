-- FolioQ: several assistant chats per portfolio.
--
-- Run this after supabase/setup.sql. Paste the whole file into the Supabase
-- SQL editor and run it. It is safe to run more than once.
--
-- What it changes: one new column on the existing `messages` table, and an
-- index. No table is added and nothing is dropped. The existing access rule
-- on `messages` (only a portfolio's owner can read or write its messages)
-- already covers the new column, so no policy changes are needed.

-- Which chat a message belongs to. Every message in one chat carries the same
-- id; a portfolio can have any number of chats.
alter table public.messages
  add column if not exists chat_id uuid;

-- Messages saved before this script become one chat per portfolio, so the
-- conversation each portfolio already has is kept as its first chat.
with earlier as (
  select portfolio_id, gen_random_uuid() as chat_id
  from public.messages
  where chat_id is null
  group by portfolio_id
)
update public.messages m
set chat_id = earlier.chat_id
from earlier
where m.portfolio_id = earlier.portfolio_id
  and m.chat_id is null;

create index if not exists messages_chat_idx
  on public.messages (portfolio_id, chat_id, created_at);

-- Check: how many chats and messages each portfolio has now.
select portfolio_id, count(distinct chat_id) as chats, count(*) as messages
from public.messages
group by portfolio_id
order by portfolio_id;
