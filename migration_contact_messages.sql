-- =========================================================
-- Contact messages — table + security
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
--
-- IMPORTANT — why this REPLACES the table:
--   A `contact_messages` table already exists from an earlier, half-finished
--   attempt, but it was never usable (the API roles were never granted access)
--   and the website has NEVER written a real message to it — so it holds no
--   real data and is safe to reset. If you ever added rows by hand and want to
--   keep them, stop and tell me first.
--
-- What this does:
--   1. Drops the old, non-working `contact_messages` table and recreates it
--   2. Grants the API roles access (so PostgREST can reach it)
--   3. Makes sure the `is_admin()` helper exists
--   4. Turns on Row Level Security with the right policies:
--        - Anyone (a visitor) can INSERT a message
--        - Only the admin can SELECT / UPDATE / DELETE messages
--
-- After running this, contact messages land in your admin panel → "Mensajes"
-- tab, and the tab shows a dot when there are unread ones.
-- =========================================================

-- 1) Fresh table ------------------------------------------
drop table if exists public.contact_messages cascade;

create table public.contact_messages (
  id          text primary key,
  created_at  timestamptz not null default now(),
  status      text        not null default 'new',   -- new | read | archived
  type        text,                                  -- general | boda | evento | funeral | empresa | otro
  name        text,
  email       text,
  phone       text,
  message     text
);

create index contact_messages_created_at_idx
  on public.contact_messages (created_at desc);

-- 2) Table grants -----------------------------------------
-- Lets the API see the table at all; RLS below enforces who can do what.
grant select, insert, update, delete on public.contact_messages to anon, authenticated;

-- 3) Admin helper — only this email has admin powers ------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

-- 4) Row Level Security -----------------------------------
alter table public.contact_messages enable row level security;

drop policy if exists "contact_insert_anyone" on public.contact_messages;
drop policy if exists "contact_select_admin"  on public.contact_messages;
drop policy if exists "contact_update_admin"  on public.contact_messages;
drop policy if exists "contact_delete_admin"  on public.contact_messages;

create policy "contact_insert_anyone"
  on public.contact_messages for insert
  to public
  with check (true);

create policy "contact_select_admin"
  on public.contact_messages for select
  to public
  using (public.is_admin());

create policy "contact_update_admin"
  on public.contact_messages for update
  to public
  using (public.is_admin())
  with check (public.is_admin());

create policy "contact_delete_admin"
  on public.contact_messages for delete
  to public
  using (public.is_admin());

-- 5) Sanity check — should list 4 policies for contact_messages
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'contact_messages'
order by cmd;
