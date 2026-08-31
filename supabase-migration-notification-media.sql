-- ============================================================
-- Sevenly · Migración: imagen/GIF/video en notificaciones
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- Cuando una notificación viene de un pop up con imagen/GIF/video, guarda
-- esa misma imagen para poder mostrar un "Ver más" en la notificación que
-- la abra en grande.
-- ============================================================

alter table notifications add column if not exists image_url text;
