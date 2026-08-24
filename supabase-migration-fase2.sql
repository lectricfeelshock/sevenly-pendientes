-- ============================================================
-- Sevenly · Migración: estados, permisos, notificaciones
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Vincular "solicita" a un perfil real (para permisos) ----------
alter table tasks add column if not exists requested_by_id uuid references profiles(id);

-- ---------- Nuevos estados: separar "Entregado" de "Finalizado" ----------
alter table tasks drop constraint if exists tasks_status_check;
alter table tasks add constraint tasks_status_check
  check (status in ('No iniciado','En progreso','Detenido','Entregado','Finalizado'));

-- Si ya tenías pendientes con el estado viejo "Terminado y entregado", los migramos a "Entregado"
update tasks set status = 'Entregado' where status = 'Terminado y entregado';

-- ---------- Recordatorios rediseñados ----------
alter table tasks add column if not exists remind_me_by uuid references profiles(id);
alter table tasks add column if not exists remind_me_notified boolean not null default false;
alter table tasks drop column if exists remind_assignee;
alter table tasks add column if not exists remind_assignee_count int not null default 0;
alter table tasks add column if not exists remind_assignee_last_date date;
alter table tasks add column if not exists notify_requester boolean not null default false;

-- ---------- Notificaciones (la campanita) ----------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  task_id uuid references tasks(id) on delete set null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz default now()
);
alter table notifications enable row level security;
create policy "Ves solo tus notificaciones" on notifications for select to authenticated using (auth.uid() = user_id);
create policy "Cualquiera crea notificaciones" on notifications for insert to authenticated with check (true);
create policy "Marcas tus notificaciones como leídas" on notifications for update to authenticated using (auth.uid() = user_id);
alter publication supabase_realtime add table notifications;

-- ---------- Registro persistente de finalizados (sobrevive aunque se borre el pendiente) ----------
create table if not exists finalized_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  task_title text,
  finalized_at timestamptz default now()
);
alter table finalized_log enable row level security;
create policy "Todos ven el registro de finalizados" on finalized_log for select to authenticated using (true);
create policy "Se agrega registro de finalizados" on finalized_log for insert to authenticated with check (true);
