-- ============================================================
-- Sevenly · Migración: varios solicitantes en un pendiente
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Varios solicitantes (antes solo existía "responsible_id", un único segundo solicitante) ----------
-- Ahora tanto pendientes Individuales como Colaborativos pueden tener más de un solicitante:
-- el que crea el pendiente + quien(es) agregue con el "+" junto a "Solicita".
alter table tasks add column if not exists co_requester_ids uuid[] not null default '{}';
alter table tasks add column if not exists co_requester_names text[] not null default '{}';

-- Migra el "responsable" viejo (single) al nuevo esquema de varios solicitantes.
update tasks
set co_requester_ids = array[responsible_id],
    co_requester_names = array[responsible_name]
where responsible_id is not null
  and not (responsible_id = any(co_requester_ids));
