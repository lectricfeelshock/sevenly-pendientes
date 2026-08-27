-- ============================================================
-- Sevenly · Migración: "Responsable" en pendientes Colaborativos
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- ---------- Segundo solicitante del pendiente Colaborativo ----------
-- Aparece junto al solicitante original, puede finalizar el pendiente
-- (cuando todas las subtareas estén "Entregado") y enviar recordatorios.
alter table tasks add column if not exists responsible_id uuid references profiles(id);
alter table tasks add column if not exists responsible_name text;
