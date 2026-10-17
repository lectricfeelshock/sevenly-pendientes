-- ============================================================
-- Sevenly · Migración: "Cuentas" (cliente/marca) + puesto (CHANGES.md #24)
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Cuentas (cliente/marca, ej. Sevenly, WorkHub, Ragasa...) ----------
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- Evita duplicados sin importar mayúsculas/espacios (ej. "sevenly" y "Sevenly").
create unique index if not exists accounts_name_lower_idx on accounts (lower(trim(name)));

alter table accounts enable row level security;

create policy "Todos los logueados ven cuentas"
  on accounts for select
  to authenticated
  using (true);

-- Cualquiera puede agregar una cuenta nueva (botón "Otras" del onboarding) —
-- queda disponible para todos de inmediato.
create policy "Todos los logueados agregan cuentas"
  on accounts for insert
  to authenticated
  with check (true);

alter publication supabase_realtime add table accounts;

insert into accounts (name) values
  ('Sevenly'), ('WorkHub'), ('Ragasa'), ('Mobil'), ('7-Eleven'), ('Promanuez'), ('Berel')
on conflict (lower(trim(name))) do nothing;

-- ---------- Perfiles: a qué cuentas perteneces + tu puesto ----------
alter table profiles add column if not exists account_ids uuid[] not null default '{}';
alter table profiles add column if not exists job_title text;
