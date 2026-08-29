-- ============================================================
-- Sevenly · Migración: pendientes referenciados en Pop Ups
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- (Es adicional a lo que ya corriste antes, no lo reemplaza)
-- ============================================================

-- Hasta 10 pendientes que el pop up puede referenciar (avisos/recordatorios
-- sobre pendientes específicos de miembros del equipo).
alter table popups add column if not exists related_task_ids uuid[] not null default '{}';
