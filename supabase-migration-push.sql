-- Copia y pega esto en Supabase → SQL Editor → New query → Run
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

alter table push_subscriptions enable row level security;

create policy "Ves tus propias suscripciones"
  on push_subscriptions for select to authenticated using (auth.uid() = user_id);

create policy "Creas tus propias suscripciones"
  on push_subscriptions for insert to authenticated with check (auth.uid() = user_id);

create policy "Borras tus propias suscripciones"
  on push_subscriptions for delete to authenticated using (auth.uid() = user_id);
