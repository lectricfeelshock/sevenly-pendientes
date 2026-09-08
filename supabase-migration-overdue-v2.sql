-- ============================================================
-- Sevenly · Migración: pendientes vencidos v2 (CHANGES.md #18)
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Recordatorio diario (en vez de una sola vez) ----------
-- Guarda la fecha (YYYY-MM-DD) del último recordatorio para no mandar más
-- de uno por día a la misma persona. tasks.overdue_last_reminded_on cubre
-- Individual/Personal (un solo asignado); subtasks.overdue_last_reminded_on
-- cubre cada integrante de un Colaborativo por su propia subtarea, para que
-- solo le llegue a quien de verdad no ha entregado su parte.
alter table tasks add column if not exists overdue_last_reminded_on date;
alter table tasks drop column if exists overdue_notified;
alter table subtasks add column if not exists overdue_last_reminded_on date;

-- ---------- Strikes ----------
-- Se guarda cuando un pendiente se borra automáticamente a los 7 días de
-- vencido sin entregarse (o, en Colaborativo, sin entregar su subtarea).
-- Sin apartado en el perfil todavía — se guarda para poder mostrarlo ahí
-- más adelante, igual que finalized_log ya guarda los finalizados.
create table if not exists strikes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  task_title text,
  created_at timestamptz not null default now()
);
alter table strikes enable row level security;
create policy "Todos ven los strikes" on strikes for select to authenticated using (true);
create policy "Se agrega un strike" on strikes for insert to authenticated with check (true);
