-- ============================================================
-- Sevenly · Migración: pendientes recurrentes con deadline el mismo día
-- Copia y pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Antes, deadline_offset_days tenía que ser de 1 a 6, así que un pendiente
-- que se repite "cada lunes con deadline ese mismo lunes" (offset 0) no se
-- podía guardar: el formulario lo permitía, pero el insert de la plantilla
-- fallaba en silencio. Ahora se permite 0 (mismo día) hasta 6.
alter table recurring_templates
  drop constraint if exists recurring_templates_deadline_offset_days_check;
alter table recurring_templates
  add constraint recurring_templates_deadline_offset_days_check
  check (deadline_offset_days between 0 and 6);
