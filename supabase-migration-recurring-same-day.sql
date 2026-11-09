-- ============================================================
-- Sevenly · Migración: rango del deadline en pendientes recurrentes
-- Copia y pega TODO este archivo en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Antes, deadline_offset_days tenía que ser de 1 a 6 para cualquier
-- recurrencia. Esa regla venía de cuando solo existía "Cada semana" y no
-- se actualizó al agregar "Cada mes". Resultado: ni "cada lunes con
-- deadline ese mismo lunes" (offset 0) ni un mensual con deadline a más
-- de 6 días se podían guardar (el insert de la plantilla fallaba).
--
-- Ahora el deadline puede ser desde el mismo día hasta justo antes de la
-- siguiente ocurrencia:
--   · semanal: 0 a 6 días
--   · mensual: 0 a 27 días (dos "N-ésimo lunes" seguidos están, como
--     mínimo, a 28 días de distancia)
alter table recurring_templates
  drop constraint if exists recurring_templates_deadline_offset_days_check;
alter table recurring_templates
  add constraint recurring_templates_deadline_offset_days_check
  check (
    deadline_offset_days >= 0 and
    deadline_offset_days <= case when frequency_type = 'monthly' then 27 else 6 end
  );
