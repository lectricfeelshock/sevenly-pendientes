-- ============================================================
-- Sevenly · Migración: el solicitante entrega subtareas olvidadas
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Aviso al solicitante cuando se vence un pendiente ----------
-- Guarda el deadline por el que ya se le avisó al solicitante que su
-- pendiente se venció con subtareas sin entregar. Si después se mueve el
-- deadline y se vuelve a vencer, ya no coincide y se le avisa de nuevo.
alter table tasks add column if not exists overdue_requester_notified_for date;

-- ---------- Subtarea entregada por el solicitante ----------
-- true cuando el solicitante la marcó como entregada porque ya se había
-- vencido sin que el asignado la actualizara. No le cuenta al asignado como
-- entregada (ni en "Mi actividad" ni en finalized_log) y le suma un strike.
alter table subtasks add column if not exists delivered_by_requester boolean not null default false;
-- Lo mismo para un pendiente normal (sin subtareas) que el solicitante dio
-- por entregado tras más de 1 día vencido.
alter table tasks add column if not exists delivered_by_requester boolean not null default false;

-- ---------- Motivo del strike ----------
-- Para distinguir los strikes por auto-borrado a los 7 días de los que se
-- dan cuando el solicitante entrega una subtarea olvidada.
alter table strikes add column if not exists reason text;
