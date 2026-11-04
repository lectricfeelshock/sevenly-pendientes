-- CHANGES.md #29: dudas que cualquiera puede mandar desde el modal de FAQ
-- (?), visibles solo para el admin en la nueva sección "FAQ" del menú.
create table if not exists faq_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  user_name text not null,
  question text not null,
  created_at timestamptz not null default now()
);

alter table faq_submissions enable row level security;

create policy "Cualquiera envia su duda" on faq_submissions
  for insert to authenticated
  with check (user_id = auth.uid());

create policy "Solo admins ven las dudas" on faq_submissions
  for select to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

create policy "Solo admins borran dudas" on faq_submissions
  for delete to authenticated
  using (exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin'));
