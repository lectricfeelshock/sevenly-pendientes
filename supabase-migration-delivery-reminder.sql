-- ============================================================
-- Sevenly · Migración: recordatorio de 24h exactas + notificaciones agrupadas
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- Soporta el ajuste de CHANGES.md #4b: el recordatorio ya no es "a las 10am
-- del día siguiente" sino exactamente 24h después de entregado, una sola
-- vez por pendiente, y agrupado en una sola notificación cuando a la misma
-- persona se le juntan más de 2 al mismo tiempo.
-- ============================================================

-- ---------- Pendientes: evita repetir el recordatorio de 24h ----------
-- Se pone en false cada vez que un pendiente se (re)entrega, y en true en
-- cuanto se le manda el recordatorio — así nunca se manda dos veces por el
-- mismo "entregado".
alter table tasks add column if not exists delivery_reminder_sent boolean not null default false;

-- ---------- Notificaciones: a dónde lleva el clic cuando no es un pendiente puntual ----------
-- Cuando el recordatorio se agrupa (más de 2 pendientes a la vez), la
-- notificación no apunta a un solo task_id — "target" guarda a dónde
-- navegar en su lugar. Hoy el único valor usado es "requests:Entregado"
-- (dashboard → pestaña "Mis solicitudes" + filtro "Entregado").
alter table notifications add column if not exists target text;
