-- CHANGES.md #35: Eventos (Junta, Sesión de Fotos, Cobertura...), un tipo de
-- pendiente aparte con su propio ciclo de vida.
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  account_ids uuid[] not null default '{}',
  category text,
  team_member_ids uuid[] not null default '{}',
  event_date date not null,
  start_time time not null,
  end_time time,
  confirmed_ids uuid[] not null default '{}',
  recurring_template_id uuid,
  summary text,
  finalized_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  reminder_4d_sent boolean not null default false,
  reminder_1d_sent boolean not null default false,
  reminder_sameday_sent boolean not null default false,
  postevent_reminder_sent boolean not null default false
);

create table if not exists event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  author_id uuid,
  author_name text,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists event_history (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

alter table notifications add column if not exists event_id uuid references events(id) on delete set null;

alter table events enable row level security;
alter table event_comments enable row level security;
alter table event_history enable row level security;

-- Mismo criterio abierto que "tasks": cualquier logueado puede ver/crear/
-- editar/borrar (el equipo de un evento se controla por UI, no por RLS).
create policy "Todos los logueados ven eventos" on events for select to authenticated using (true);
create policy "Todos los logueados crean eventos" on events for insert to authenticated with check (true);
create policy "Todos los logueados actualizan eventos" on events for update to authenticated using (true);
create policy "Todos los logueados borran eventos" on events for delete to authenticated using (true);

create policy "Todos los logueados ven comentarios de eventos" on event_comments for select to authenticated using (true);
create policy "Todos los logueados comentan eventos" on event_comments for insert to authenticated with check (true);
create policy "Todos los logueados ven historial de eventos" on event_history for select to authenticated using (true);
create policy "Todos los logueados agregan historial de eventos" on event_history for insert to authenticated with check (true);
