-- =========================================================
-- Pot size (planter picker)
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Adds `pot_size` to products. It means two things by context:
--   • on a POT (categoría Macetas): the pot's own size  (S / M / L)
--   • on a PLANT: the size of pot it needs — setting this turns on the
--     "Elige tu maceta" picker on that plant's page, showing pots of that size.
--
-- The products table already has its grants + RLS, so this only adds the column.
-- =========================================================

alter table public.products
  add column if not exists pot_size text;   -- '' | 'S' | 'M' | 'L'

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name = 'pot_size';
