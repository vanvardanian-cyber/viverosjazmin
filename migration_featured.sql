-- =========================================================
-- Featured products (homepage rail)
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.
--
-- Adds a `featured` flag to products. Tick "Destacar en portada" in the admin
-- and the product shows in the homepage "Una selección" rail. If no products
-- are flagged, the rail auto-fills (round-robin) so it's never empty.
--
-- The products table already has its grants + RLS (public read, admin write)
-- from earlier migrations, so this only adds the column.
-- =========================================================

alter table public.products
  add column if not exists featured boolean not null default false;

-- Optional: index so "featured first" queries stay fast as the catalogue grows
create index if not exists products_featured_idx on public.products (featured);

-- Sanity check — should return one row: featured | boolean
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name = 'featured';
