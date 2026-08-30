-- ============================================================
-- Sevenly · Migración: recordatorios de finalizado + pop ups en borrador
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- Soporta CHANGES.md #3 (pestañas de Popups) y #4 (recordatorios al
-- solicitante para que finalice sus pendientes entregados).
-- ============================================================

-- ---------- Notificaciones con título propio (además del mensaje) ----------
-- Antes toda notificación solo tenía "message". Los nuevos recordatorios de
-- finalizado necesitan un título fijo ("Te entregaron un pendiente",
-- "¿Pudiste revisarlo?") separado de la descripción. Nullable: las
-- notificaciones viejas y las que no lo necesitan se quedan sin título y se
-- siguen mostrando igual que antes.
alter table notifications add column if not exists title text;

-- ---------- Pop ups: permitir "borrador" sin fecha, y marcar los que crea el sistema ----------
-- "Nuevos" (CHANGES.md #3) son pop ups sin scheduled_date todavía — el admin
-- los programa después editándolos. auto_generated distingue los que arma el
-- cron de recordatorio de finalizado (CHANGES.md #4c) de los que arma el
-- admin a mano, para poder darles seguimiento/cancelarlos automáticamente.
alter table popups alter column scheduled_date drop not null;
alter table popups add column if not exists auto_generated boolean not null default false;

-- ---------- Pendientes: liga al pop up de recordatorio pendiente (si tiene uno) ----------
-- Evita crear dos veces el mismo recordatorio para el mismo pendiente
-- mientras el pop up sigue sin salir, y permite cancelarlo/actualizarlo si
-- el solicitante finaliza antes de que salga.
alter table tasks add column if not exists finalize_reminder_popup_id uuid references popups(id) on delete set null;

-- ---------- Registro de finalizados: cuándo se entregó y si quedó "rezagado" ----------
-- rezagado = se finalizó en un día distinto al que se entregó (el solicitante
-- se tardó en revisarlo). El reporte descargable usa delivered_at en vez de
-- finalized_at para esos casos, con la etiqueta "Rezagado".
alter table finalized_log add column if not exists delivered_at timestamptz;
alter table finalized_log add column if not exists is_delayed boolean not null default false;
