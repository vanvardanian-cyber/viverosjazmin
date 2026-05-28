-- =========================================================
-- Migration: add `origin` column to products table
-- Run this once in the Supabase SQL editor.
-- Safe to re-run thanks to IF NOT EXISTS.
-- =========================================================

alter table public.products
  add column if not exists origin text;

-- Optional: backfill some sensible defaults by category.
-- Comment out / adjust to taste — these are just examples.
-- update public.products set origin = 'Países Bajos'  where origin is null and cat = 'ramos';
-- update public.products set origin = 'Vivero propio · Castelló' where origin is null and cat = 'plantas';
-- update public.products set origin = 'Andalucía'     where origin is null and cat = 'frutales';
