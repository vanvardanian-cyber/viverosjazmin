-- =========================================================
-- Product reviews (with moderation)
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Logged-in customers can leave ONE review per product (1–5 stars + text).
-- New reviews start as 'pending' and only appear on the site after the
-- admin approves them in the new "Reseñas" tab of the admin panel.
-- =========================================================

-- Admin helper (idempotent — may already exist from earlier migrations)
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

create table if not exists public.reviews (
  id         uuid primary key default gen_random_uuid(),
  product_id text not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  author     text not null,
  rating     int  not null check (rating between 1 and 5),
  body       text,
  status     text not null default 'pending',   -- pending | approved | rejected
  created_at timestamptz not null default now(),
  unique (product_id, user_id)                  -- one review per user per product
);

alter table public.reviews enable row level security;

-- Public sees approved reviews; authors see their own; admin sees all.
drop policy if exists "reviews_select" on public.reviews;
create policy "reviews_select" on public.reviews for select
  using (status = 'approved' or auth.uid() = user_id or public.is_admin());

-- Logged-in users insert their own review, always starting as pending.
drop policy if exists "reviews_insert" on public.reviews;
create policy "reviews_insert" on public.reviews for insert
  with check (auth.uid() = user_id and status = 'pending');

-- Only the admin moderates (approve / reject / delete).
drop policy if exists "reviews_update" on public.reviews;
create policy "reviews_update" on public.reviews for update
  using (public.is_admin());

drop policy if exists "reviews_delete" on public.reviews;
create policy "reviews_delete" on public.reviews for delete
  using (public.is_admin());

grant select on public.reviews to anon, authenticated;
grant insert on public.reviews to authenticated;
grant update, delete on public.reviews to authenticated;  -- gated by RLS is_admin

select 'reviews table ready' as status;
