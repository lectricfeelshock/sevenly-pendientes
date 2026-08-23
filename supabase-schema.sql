-- ============================================================
-- Sevenly · Esquema de base de datos
-- Copia y pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Extensión para generar IDs únicos
create extension if not exists "pgcrypto";

-- ---------- Perfiles (uno por usuario, ligado a Supabase Auth) ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Cualquier usuario logueado puede ver todos los perfiles"
  on profiles for select
  to authenticated
  using (true);

create policy "Un usuario solo edita su propio perfil"
  on profiles for update
  to authenticated
  using (auth.uid() = id);

create policy "Un usuario crea su propio perfil"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id);

-- Crea el perfil automáticamente cuando alguien se registra
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Sin nombre'),
    new.email,
    new.raw_user_meta_data->>'phone'
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Pendientes ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  category text not null default 'General',
  requested_by text not null,
  request_date date not null default current_date,
  deadline date,
  urgency text not null default 'Media' check (urgency in ('Baja','Media','Alta','Urgente')),
  assigned_to_id uuid references profiles(id),
  assigned_to_name text not null,
  status text not null default 'No iniciado' check (status in ('No iniciado','En progreso','Detenido','Terminado y entregado')),
  checked_done boolean default false,
  remind_me boolean default false,
  remind_assignee boolean default false,
  completed_at timestamptz,
  completed_by uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

alter table tasks enable row level security;

create policy "Todos los logueados ven todos los pendientes"
  on tasks for select to authenticated using (true);

create policy "Todos los logueados crean pendientes"
  on tasks for insert to authenticated with check (true);

create policy "Todos los logueados actualizan pendientes"
  on tasks for update to authenticated using (true);

create policy "Todos los logueados borran pendientes"
  on tasks for delete to authenticated using (true);

-- ---------- Comentarios ----------
create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  author_id uuid references profiles(id),
  author_name text not null,
  text text not null,
  created_at timestamptz default now()
);

alter table task_comments enable row level security;

create policy "Todos los logueados ven comentarios"
  on task_comments for select to authenticated using (true);

create policy "Todos los logueados comentan"
  on task_comments for insert to authenticated with check (true);

-- ---------- Historial ----------
create table if not exists task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  text text not null,
  created_at timestamptz default now()
);

alter table task_history enable row level security;

create policy "Todos los logueados ven historial"
  on task_history for select to authenticated using (true);

create policy "Todos los logueados agregan historial"
  on task_history for insert to authenticated with check (true);

-- ---------- Habilitar tiempo real (para que se actualice solo en pantalla) ----------
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table task_comments;
alter publication supabase_realtime add table task_history;
