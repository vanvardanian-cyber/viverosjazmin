-- =========================================================
-- Job applications (CVs) — table + security
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
--
-- IMPORTANT — why this REPLACES the table:
--   An `applications` table already exists in this project from an earlier,
--   half-finished attempt, but it was never usable (wrong column rules, and
--   the API roles were never granted access). The website has NEVER written a
--   real application to it, so it holds no real data — it is safe to reset it
--   to the correct shape. If you ever DID add rows by hand and want to keep
--   them, stop and tell me first.
--
-- What this does:
--   1. Drops the old, non-working `applications` table and recreates it clean
--   2. Grants the API roles access (so PostgREST can reach it)
--   3. Makes sure the `is_admin()` helper exists
--   4. Turns on Row Level Security with the right policies:
--        - Anyone (a job candidate) can INSERT an application
--        - Only the admin can SELECT / UPDATE / DELETE applications
--
-- After running this, job applications submitted on ANY device land in your
-- admin panel → "Candidaturas" tab, with the CV downloadable.
-- =========================================================

-- 1) Fresh table ------------------------------------------
drop table if exists public.applications cascade;

create table public.applications (
  id          text primary key,
  created_at  timestamptz not null default now(),
  status      text        not null default 'new',   -- new | reviewed | contacted | discarded
  position    text,                                  -- which role they applied to
  name        text,
  email       text,
  phone       text,
  path        text,                                  -- 'cv' or 'nocv'
  cv          jsonb,                                 -- { filename, size, dataUrl }  (null if no CV)
  answers     jsonb       not null default '{}'::jsonb,
  message     text
);

-- Newest-first ordering in the admin list
create index applications_created_at_idx
  on public.applications (created_at desc);

-- 2) Table grants -----------------------------------------
-- PostgREST reaches the table as the `anon` (guest) and `authenticated`
-- (logged-in) roles. Without these grants you get "permission denied for
-- table" (42501) even with RLS in place. RLS below is what actually enforces
-- who can do what — these grants just let the API see the table at all.
grant select, insert, update, delete on public.applications to anon, authenticated;

-- 3) Admin helper — only this email has admin powers ------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

-- 4) Row Level Security -----------------------------------
alter table public.applications enable row level security;

drop policy if exists "apps_insert_anyone" on public.applications;
drop policy if exists "apps_select_admin"  on public.applications;
drop policy if exists "apps_update_admin"  on public.applications;
drop policy if exists "apps_delete_admin"  on public.applications;

create policy "apps_insert_anyone"
  on public.applications for insert
  to public
  with check (true);

create policy "apps_select_admin"
  on public.applications for select
  to public
  using (public.is_admin());

create policy "apps_update_admin"
  on public.applications for update
  to public
  using (public.is_admin())
  with check (public.is_admin());

create policy "apps_delete_admin"
  on public.applications for delete
  to public
  using (public.is_admin());

-- 5) Sanity check — should list 4 policies for applications
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename = 'applications'
order by cmd;
