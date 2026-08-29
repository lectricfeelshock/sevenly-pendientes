-- ============================================================
-- Sevenly · Migración: desglose configurable de pendientes en Pop Ups
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- (Es adicional a lo que ya corriste antes, no lo reemplaza. Reemplaza
-- en el código el uso de la columna "related_task_ids" que se agregó
-- en supabase-migration-popup-tasks.sql — esa columna se queda ahí sin
-- usarse, no hace falta borrarla)
-- ============================================================

-- Pendientes referenciados en el pop up, cada uno con los campos que el
-- admin eligió mostrar. Formato: [{"id": "<uuid del pendiente>", "fields": ["status","deadline",...]}]
alter table popups add column if not exists related_tasks jsonb not null default '[]'::jsonb;

-- Fechas de entrega — antes solo vivían implícitas en el texto del
-- historial, ahora se guardan directo para poder mostrarlas en el
-- desglose del pop up sin tener que parsear texto.
alter table tasks add column if not exists delivered_at timestamptz;
alter table tasks add column if not exists finalized_at timestamptz;
alter table subtasks add column if not exists delivered_at timestamptz;
