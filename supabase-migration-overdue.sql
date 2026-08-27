-- ============================================================
-- Sevenly · Migración: pendientes vencidos ("Muy urgente")
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Evita re-notificar cada vez que se recarga la página ----------
-- Se pone en true la primera vez que se avisa que un pendiente Individual o
-- Personal se venció sin entregarse. Se libera (false) si cambia el deadline
-- o si el estado deja de estar "Entregado", por si vuelve a vencerse.
alter table tasks add column if not exists overdue_notified boolean not null default false;
