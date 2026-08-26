-- ============================================================
-- Sevenly · Migración: comentarios leídos (badge de comentarios nuevos)
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Marca de "hasta cuándo leyó cada quién los comentarios de cada pendiente" ----------
create table if not exists task_comment_reads (
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (task_id, user_id)
);

alter table task_comment_reads enable row level security;

create policy "Ves solo tus propias marcas de lectura"
  on task_comment_reads for select to authenticated using (auth.uid() = user_id);

create policy "Marcas tus propios comentarios como leídos"
  on task_comment_reads for insert to authenticated with check (auth.uid() = user_id);

create policy "Actualizas tus propias marcas de lectura"
  on task_comment_reads for update to authenticated using (auth.uid() = user_id);

alter publication supabase_realtime add table task_comment_reads;
