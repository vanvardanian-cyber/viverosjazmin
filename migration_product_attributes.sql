-- =========================================================
-- Product attributes for the Floristería filters
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once (idempotent).
--
-- Adds three optional columns to products so flower items can be filtered by:
--   florist_type — Ramo / Decoración / Flores / Planta con flor
--   flower_type  — Rosa, Gerbera, Clavel, Girasol… (free text)
--   color        — Rojo, Blanco, Rosa, Amarillo… (free text)
--
-- They're nullable, so existing products (and all vivero products) are
-- unaffected. The shop builds the filter checkboxes from whatever values
-- you enter in the admin.
-- =========================================================

alter table public.products add column if not exists florist_type text;
alter table public.products add column if not exists flower_type  text;
alter table public.products add column if not exists color        text;

-- Sanity check — show the new columns
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products'
  and column_name in ('florist_type','flower_type','color')
order by column_name;
