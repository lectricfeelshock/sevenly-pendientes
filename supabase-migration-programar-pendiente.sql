-- ============================================================
-- Sevenly · Migración: Programar pendiente (día programado + repetición)
-- Copia y pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Pendiente programado sin repetición ----------
-- No hace falta ninguna columna nueva en "tasks": se reutiliza
-- tasks.request_date, que ya existía. Un pendiente "programado, no se
-- repite" simplemente nace con request_date puesto en el futuro (el "Día
-- programado" que se eligió al crearlo) en vez de la fecha de hoy.

-- ---------- Plantillas de recurrencia: mensual + subtareas + apuntador a la tarjeta viva ----------
alter table recurring_templates
  add column if not exists task_type text not null default 'individual'
    check (task_type in ('individual', 'colaborativo')),
  add column if not exists team_member_ids uuid[] not null default '{}',
  add column if not exists co_requester_ids uuid[] not null default '{}',
  add column if not exists urgency text not null default 'Media',
  add column if not exists frequency_type text not null default 'weekly'
    check (frequency_type in ('weekly', 'monthly')),
  add column if not exists month_occurrence int not null default 1,
  -- "1" = la 1ª ocurrencia de ese día de la semana en el mes (ej. "el
  -- primer jueves"). Solo se usa cuando frequency_type = 'monthly'.
  add column if not exists subtask_specs jsonb not null default '[]',
  -- [{ "title": "...", "description": "...", "assigned_to_id": "uuid|null", "offset_days": 2 }, ...]
  -- Cada subtarea de la plantilla, con su deadline guardado como conteo de
  -- días desde el día programado — no como fecha fija — para poder
  -- recalcularse en cada ocurrencia nueva.
  add column if not exists last_generated_on date,
  -- Evita que el cron genere el pendiente dos veces si corriera dos veces
  -- el mismo día.
  add column if not exists current_task_id uuid references tasks(id) on delete set null;
  -- El pendiente que representa la ocurrencia actual — la tarjeta "viva"
  -- que se muestra en Mis solicitudes > Programados. Se actualiza cada vez
  -- que el cron genera una ocurrencia nueva.

-- Las plantillas de frecuencia que ya existían (creadas con la opción
-- anterior, solo semanal) se quedan con frequency_type = 'weekly' por
-- default — es exactamente cómo ya funcionaban, no se les cambia nada.
-- Lo único que hace falta es apuntar cada una a la última tarea que
-- generó, para que también aparezcan en el nuevo filtro "Programados" sin
-- tener que tocar su historial:
update recurring_templates rt
set current_task_id = (
  select t.id from tasks t
  where t.recurring_template_id = rt.id
  order by t.created_at desc
  limit 1
)
where rt.current_task_id is null;
