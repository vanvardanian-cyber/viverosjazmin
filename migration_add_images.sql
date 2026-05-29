-- =========================================================
-- Add `images` column to products (array of up to 6 image URLs)
-- Idempotent: safe to re-run.
-- =========================================================

alter table public.products
  add column if not exists images jsonb not null default '[]'::jsonb;

-- Backfill: if a product has a single `img` but no `images`,
-- promote that single img into the new array so existing products
-- show their photo on day one.
update public.products
  set images = jsonb_build_array(img)
  where img is not null
    and (images = '[]'::jsonb or images is null);

-- Sanity check: how many products now have at least one image?
select
  count(*) filter (where jsonb_array_length(images) > 0) as products_with_images,
  count(*) as total_products
from public.products;
