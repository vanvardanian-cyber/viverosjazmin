-- =========================================================
-- Customer accounts → Supabase Auth (profiles table)
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Idempotent: safe to run more than once.
--
-- WHAT THIS IS FOR
--   Until now, customer logins lived only in the browser (localStorage).
--   We're moving them to REAL Supabase Auth so accounts work across devices,
--   orders attach to a person, and reviews can require a real purchase.
--
--   Supabase Auth already stores the login itself (email + password) in the
--   hidden `auth.users` table. This migration adds a `profiles` table next to
--   it for the EXTRA fields a florist account needs: name, phone, addresses.
--
-- BEFORE OR AFTER RUNNING THIS, do 2 things in the dashboard:
--   1. Authentication → Providers → Email  → make sure "Email" is ENABLED
--      (it is by default).
--   2. Authentication → Providers → Email  → turn OFF "Confirm email"
--      (newer UI: Authentication → Sign In / Up → "Confirm email" = off).
--      This lets a new customer log in instantly after signing up, with no
--      confirmation email. You can turn it back on later once you want email
--      verification. (Leave it ON only if you're OK with customers having to
--      click a link in an email before their first login.)
--
-- WHAT THIS DOES
--   1. Makes sure the `is_admin()` helper exists (same one used elsewhere)
--   2. Creates the `profiles` table (one row per customer)
--   3. Adds a trigger that auto-creates a profile row whenever someone signs up
--   4. Grants the API roles access + turns on Row Level Security:
--        - a customer can read / edit ONLY their own profile
--        - the admin can read every profile
-- =========================================================

-- 1) Admin helper — only this email has admin powers ------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

-- 2) Profiles table ---------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  phone       text,
  addresses   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

grant select, insert, update on public.profiles to anon, authenticated;

-- 3) Auto-create a profile row on signup ------------------------------------
--    Reads name/phone from the metadata the website sends with signUp().
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name',  ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Row Level Security -----------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own"          on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles_update_own_or_admin"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- 5) Let a customer delete their OWN account --------------------------------
--    The website's anon key can't delete an auth user directly (by design),
--    so we expose a tightly-scoped function. It only ever deletes the caller's
--    own account (auth.uid()) — never anyone else's. Deleting the auth user
--    cascades to their `profiles` row automatically (FK on delete cascade).
--    Past orders are kept as shop records (their user_id is set null later).
create or replace function public.delete_current_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_current_user() from public, anon;
grant execute on function public.delete_current_user() to authenticated;

-- 6) Sanity check -----------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd;

