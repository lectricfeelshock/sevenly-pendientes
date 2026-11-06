-- ============================================================
-- Sevenly · Migración: varias cuentas por pendiente (CHANGES.md #33)
-- Copia y pega TODO esto en Supabase → SQL Editor → New query → Run
-- (Ya se aplicó en producción el 2026-11-06; se guarda aquí como registro.)
-- ============================================================

alter table tasks add column if not exists account_ids uuid[] not null default '{}';
alter table recurring_templates add column if not exists account_ids uuid[] not null default '{}';

-- Los que ya existen conservan su cuenta única como lista de una.
update tasks set account_ids = array[account_id] where account_id is not null and account_ids = '{}';
update recurring_templates set account_ids = array[account_id] where account_id is not null and account_ids = '{}';
