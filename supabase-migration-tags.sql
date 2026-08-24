-- Copia y pega esto en Supabase → SQL Editor → New query → Run
alter table resources add column if not exists tags text[] not null default '{}';
