-- ============================================================
-- Sevenly · Migración: sin límite de días para el deadline en pendientes recurrentes
-- Copia y pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Antes, deadline_offset_days tenía que ser de 1 a 6 para cualquier
-- recurrencia. Esa regla venía de cuando solo existía "Cada semana" y no
-- se actualizó al agregar "Cada mes". Resultado: ni "cada lunes con
-- deadline ese mismo lunes" (offset 0) ni un mensual con deadline a más
-- de 6 días se podían guardar (el insert de la plantilla fallaba).
--
-- Ahora el deadline se elige libremente en el calendario: solo se pide
-- que no sea antes del día en que aparece (offset 0 o más), sin tope.
alter table recurring_templates
  drop constraint if exists recurring_templates_deadline_offset_days_check;
alter table recurring_templates
  add constraint recurring_templates_deadline_offset_days_check
  check (deadline_offset_days >= 0);
