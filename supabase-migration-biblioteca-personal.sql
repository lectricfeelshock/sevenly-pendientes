-- ============================================================
-- Sevenly · Migración: Recursos personales en Biblioteca (CHANGES.md #2)
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- (Es adicional a supabase-migration-biblioteca.sql y
-- supabase-migration-tags.sql, que ya corriste antes — no los reemplaza)
-- ============================================================

-- ---------- Columnas nuevas en "resources" ----------
-- is_general = true  → "Recursos generales" (hoy: solo el admin los crea).
-- is_general = false → recurso personal: solo lo ve su dueño (owner_id) y
--   con quien lo haya compartido (shared_with).
alter table resources add column if not exists owner_id uuid references profiles(id);
alter table resources add column if not exists is_general boolean not null default true;
alter table resources add column if not exists shared_with uuid[] not null default '{}';

-- Un recurso puede tener link O archivo (o ambos, aunque el formulario solo
-- deja elegir uno) — por eso "url" deja de ser obligatorio.
alter table resources alter column url drop not null;
alter table resources add column if not exists file_path text;
alter table resources add column if not exists file_name text;
alter table resources add column if not exists file_type text;
alter table resources add column if not exists file_size bigint;
alter table resources add constraint resources_link_or_file
  check (url is not null or file_path is not null);

-- De qué recurso general viene esta copia personal (botón "Añadir a mis
-- recursos", punto f) — sirve para no dejar copiar el mismo dos veces.
alter table resources add column if not exists copied_from uuid references resources(id) on delete set null;

-- Recursos ya existentes: quedan como generales, con su creador como dueño.
update resources set owner_id = created_by, is_general = true where owner_id is null;

-- ---------- RLS: reemplaza las políticas viejas (admin-only) ----------
drop policy if exists "Todos los logueados ven recursos" on resources;
drop policy if exists "Solo admins crean recursos" on resources;
drop policy if exists "Solo admins editan recursos" on resources;
drop policy if exists "Solo admins borran recursos" on resources;

-- Ves un recurso si es general, si es tuyo, o si te lo compartieron.
create policy "Ve recursos generales, propios o compartidos"
  on resources for select
  to authenticated
  using (is_general = true or owner_id = auth.uid() or auth.uid() = any(shared_with));

-- Solo admins crean/editan/borran recursos GENERALES (igual que antes).
create policy "Admins crean recursos generales"
  on resources for insert
  to authenticated
  with check (is_general = true and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Admins editan recursos generales"
  on resources for update
  to authenticated
  using (is_general = true and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy "Admins borran recursos generales"
  on resources for delete
  to authenticated
  using (is_general = true and exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Cualquier usuario crea/edita/borra sus PROPIOS recursos personales
-- (incluye cambiar "shared_with" para compartirlos, y las copias que se
-- hacen con "Añadir a mis recursos" desde Generales).
create policy "Cualquiera crea sus recursos personales"
  on resources for insert
  to authenticated
  with check (is_general = false and owner_id = auth.uid());

create policy "El dueño edita su recurso personal"
  on resources for update
  to authenticated
  using (is_general = false and owner_id = auth.uid());

create policy "El dueño borra su recurso personal"
  on resources for delete
  to authenticated
  using (is_general = false and owner_id = auth.uid());

-- ============================================================
-- Almacenamiento de archivos subidos (imágenes, PDF, Word, Excel)
--
-- Investigación de límites (2026-09-15): el proyecto está en el plan Free
-- de Supabase → 1 GB de storage total incluido, actualmente en 0 bytes
-- usados. Es viable habilitar subida de archivos. Para no llenarlo con
-- archivos pesados, el bucket limita cada archivo a 20 MB y solo acepta
-- los tipos pedidos. Si el equipo empieza a subir muchos archivos,
-- conviene revisar el uso en Supabase → Project Settings → Billing → Usage
-- antes de que se acerque a ese 1 GB.
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resource-files', 'resource-files', true, 20971520,
  array[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Cualquiera ve archivos de biblioteca" on storage.objects;
create policy "Cualquiera ve archivos de biblioteca"
  on storage.objects for select
  to public
  using (bucket_id = 'resource-files');

drop policy if exists "Cualquier logueado sube archivos de biblioteca" on storage.objects;
create policy "Cualquier logueado sube archivos de biblioteca"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'resource-files');

drop policy if exists "Dueño o admin borra archivos de biblioteca" on storage.objects;
create policy "Dueño o admin borra archivos de biblioteca"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resource-files'
    and (owner = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  );
