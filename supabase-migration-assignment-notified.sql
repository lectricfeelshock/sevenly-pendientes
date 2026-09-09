-- ============================================================
-- Sevenly · Migración: no notificar pendientes programados hasta que se
-- publican. Copia y pega TODO este archivo en Supabase → SQL Editor →
-- New query → Run
-- ============================================================

-- Antes, "Te asignaron ...", "Te agregaron al equipo ...", etc. se
-- mandaban en cuanto se CREABA el pendiente, aunque fuera "Programado"
-- (Día programado en el futuro) — llegaban mucho antes de que el
-- pendiente se publicara de verdad. Esta columna marca si esas
-- notificaciones ya se mandaron (true, para un pendiente normal que se
-- publica de inmediato) o siguen pendientes de mandarse el día que el
-- pendiente programado se publique (false) — ese día las manda el cron
-- /api/publish-scheduled.
--
-- Default true: para no bombardear con notificaciones "atrasadas" a todo
-- el historial de pendientes que ya existían antes de esta migración.
alter table tasks
  add column if not exists assignment_notified boolean not null default true;
