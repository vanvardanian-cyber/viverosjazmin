-- =========================================================
-- Orders + RLS hardening
-- Paste this into Supabase → SQL Editor → New query → Run.
-- It's idempotent: safe to re-run.
--
-- What it does:
--   1. Makes sure the `is_admin()` helper exists and is correct
--   2. Confirms RLS is ON for the orders table
--   3. Drops any older policies and re-creates the clean set:
--        - Anyone (guest or logged in) can INSERT a new order
--        - Only the admin can SELECT / UPDATE / DELETE orders
--   4. Same hardening for products, applications, contact_messages
--      (admin-only writes, public reads for products only)
-- =========================================================

-- 1) Admin helper — only the email below has admin powers.
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

-- 2) ORDERS — make sure RLS is on, then re-create policies
alter table public.orders enable row level security;

drop policy if exists "orders_insert_anyone" on public.orders;
drop policy if exists "orders_select_admin"  on public.orders;
drop policy if exists "orders_update_admin"  on public.orders;
drop policy if exists "orders_delete_admin"  on public.orders;

create policy "orders_insert_anyone"
  on public.orders for insert
  to public
  with check (true);

create policy "orders_select_admin"
  on public.orders for select
  to public
  using (public.is_admin());

create policy "orders_update_admin"
  on public.orders for update
  to public
  using (public.is_admin())
  with check (public.is_admin());

create policy "orders_delete_admin"
  on public.orders for delete
  to public
  using (public.is_admin());

-- 3) PRODUCTS — readable by everyone, writable only by admin
alter table public.products enable row level security;

drop policy if exists "products_select_all"   on public.products;
drop policy if exists "products_insert_admin" on public.products;
drop policy if exists "products_update_admin" on public.products;
drop policy if exists "products_delete_admin" on public.products;

create policy "products_select_all"
  on public.products for select
  to public
  using (true);

create policy "products_insert_admin"
  on public.products for insert
  to public
  with check (public.is_admin());

create policy "products_update_admin"
  on public.products for update
  to public
  using (public.is_admin())
  with check (public.is_admin());

create policy "products_delete_admin"
  on public.products for delete
  to public
  using (public.is_admin());

-- 4) APPLICATIONS (job apps) — insert by anyone, read/update/delete admin-only
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

-- 5) CONTACT MESSAGES — insert by anyone, read/update/delete admin-only
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

-- 6) Sanity check — show which policies are now in place
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, cmd;
