-- ============================================================
-- Sevenly · Migración: "Avisarme" por persona (ya no solo el primero que le pique)
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Recordatorios "avisarme": ahora es una lista de personas, no un solo dueño ----------
alter table tasks add column if not exists remind_me_by_ids uuid[] not null default '{}';
alter table tasks add column if not exists remind_me_notified_ids uuid[] not null default '{}';

-- Migra lo que ya estaba activado con el esquema viejo (una sola persona) a la lista nueva
update tasks
  set remind_me_by_ids = array[remind_me_by]
  where remind_me_by is not null and not (remind_me_by = any(remind_me_by_ids));

update tasks
  set remind_me_notified_ids = array[remind_me_by]
  where remind_me_by is not null and remind_me_notified = true and not (remind_me_by = any(remind_me_notified_ids));

-- Columnas viejas ya no se usan en la app, se pueden borrar
alter table tasks drop column if exists remind_me_by;
alter table tasks drop column if exists remind_me_notified;
