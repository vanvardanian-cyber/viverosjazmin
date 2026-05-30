-- =========================================================
-- Job application questions — table + security + defaults
-- Paste this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once (it resets to a known-good state).
--
-- Why a table: until now the questions admins added only lived in the
-- admin's own browser, so real visitors never saw them (they only got the
-- 3 built-in defaults). Moving them to the database means any question you
-- add/edit/reorder in the admin shows on the public form for everyone.
--
-- Policies:
--   - SELECT: public (everyone must be able to read the questions to fill the form)
--   - INSERT / UPDATE / DELETE: admin only
-- This table seeds the 3 default questions so the form works immediately.
-- =========================================================

-- 1) Fresh table ------------------------------------------
drop table if exists public.job_questions cascade;

create table public.job_questions (
  id          text primary key,
  sort_order  int         not null default 0,
  type        text        not null default 'text',   -- text|textarea|dropdown|radio|multiselect|date
  label_es    text,
  label_va    text,
  required    boolean     not null default false,
  skip_if_cv  boolean     not null default false,
  options     jsonb       not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index job_questions_sort_idx on public.job_questions (sort_order asc);

-- 2) Table grants -----------------------------------------
grant select, insert, update, delete on public.job_questions to anon, authenticated;

-- 3) Admin helper -----------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'vanomg95@gmail.com'
$$;

-- 4) Row Level Security -----------------------------------
alter table public.job_questions enable row level security;

drop policy if exists "jobq_select_all"   on public.job_questions;
drop policy if exists "jobq_insert_admin" on public.job_questions;
drop policy if exists "jobq_update_admin" on public.job_questions;
drop policy if exists "jobq_delete_admin" on public.job_questions;

-- Everyone can READ the questions (needed to render the public form)
create policy "jobq_select_all"
  on public.job_questions for select
  to public
  using (true);

-- Only the admin can change them
create policy "jobq_insert_admin"
  on public.job_questions for insert
  to public
  with check (public.is_admin());

create policy "jobq_update_admin"
  on public.job_questions for update
  to public
  using (public.is_admin())
  with check (public.is_admin());

create policy "jobq_delete_admin"
  on public.job_questions for delete
  to public
  using (public.is_admin());

-- 5) Seed the 3 default questions -------------------------
insert into public.job_questions (id, sort_order, type, label_es, label_va, required, skip_if_cv, options) values
  ('q-experience', 0, 'dropdown',
   '¿Tienes experiencia previa en viveros o floristería?',
   'Tens experiència prèvia en vivers o floristeria?',
   true, true,
   '[{"es":"Ninguna","va":"Cap"},{"es":"Algo (hasta 2 años)","va":"Alguna (fins a 2 anys)"},{"es":"Sí, más de 2 años","va":"Sí, més de 2 anys"}]'::jsonb),
  ('q-startdate', 1, 'date',
   '¿Cuándo podrías empezar?',
   'Quan podries començar?',
   false, false, '[]'::jsonb),
  ('q-commitment', 2, 'radio',
   '¿Estás dispuesto/a a trabajar a veces los domingos y a hacer horas extra cuando el vivero lo necesita?',
   'Estàs disposat/da a treballar de vegades els diumenges i a fer hores extra quan el viver ho necessita?',
   true, false,
   '[{"es":"Sí, sin problema","va":"Sí, sense problema"},{"es":"Algún domingo puntual","va":"Algun diumenge puntual"},{"es":"Prefiero no trabajar domingos","va":"Preferisc no treballar diumenges"}]'::jsonb);

-- 6) Sanity check — should list 4 policies + show the 3 seeded rows
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'job_questions' order by cmd;
select id, sort_order, type, required from public.job_questions order by sort_order;
