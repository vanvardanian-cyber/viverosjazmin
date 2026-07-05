-- =========================================================
-- Product video (optional)
-- Paste this into Supabase → SQL Editor → New query → Run. Safe to re-run.
--
-- Adds `video_url` to products — a YouTube/Vimeo link or a direct .mp4 file
-- link, shown on the product page below the photo gallery. No file upload/
-- storage involved, just a link, so it can't repeat the base64-image egress
-- problem we fixed earlier.
--
-- The products table already has its grants + RLS, so this only adds the column.
-- =========================================================

alter table public.products
  add column if not exists video_url text;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'products' and column_name = 'video_url';
