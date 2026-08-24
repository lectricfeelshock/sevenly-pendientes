-- ============================================================
-- Sevenly · Migración: Biblioteca de recursos
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- (Es adicional al supabase-schema.sql que ya corriste antes, no lo reemplaza)
-- ============================================================

-- Agrega el rol a los perfiles (por default todos son "member")
alter table profiles add column if not exists role text not null default 'member' check (role in ('member','admin'));

-- ---------- Recursos de la Biblioteca ----------
create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  url text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table resources enable row level security;

create policy "Todos los logueados ven recursos"
  on resources for select
  to authenticated
  using (true);

create policy "Solo admins crean recursos"
  on resources for insert
  to authenticated
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Solo admins editan recursos"
  on resources for update
  to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Solo admins borran recursos"
  on resources for delete
  to authenticated
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

alter publication supabase_realtime add table resources;

-- ============================================================
-- IMPORTANTE: después de correr esto, tienes que marcarte como admin
-- manualmente (nadie es admin por default, ni tú).
--
-- 1. Ve a Table Editor (menú izquierdo) → tabla "profiles"
-- 2. Busca tu fila (tu nombre)
-- 3. Dale doble clic a la celda de "role" y cámbiala de "member" a "admin"
-- 4. Presiona Enter para guardar
-- ============================================================
