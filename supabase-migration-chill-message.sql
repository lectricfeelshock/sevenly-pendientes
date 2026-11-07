-- ============================================================
-- Sevenly · Migración: frase "Todo chill" variable por pendiente
-- Pega TODO esto en Supabase → SQL Editor → New query → Run
-- ============================================================

-- Frase que se muestra en el pendiente mientras faltan 4 días o más para el
-- deadline. Se escoge al crear el pendiente y cuando alguien mueve el deadline.
alter table tasks add column if not exists chill_message text;

-- Marca los pendientes que ya existían (abiertos y con deadline a 4+ días)
update tasks
  set chill_message = (array[
    'Todo chill, aún falta', 'Tranqui, hay tiempo', 'Vas sobrado de tiempo',
    'Respira, aún hay margen', 'Sin prisa, por ahora', 'Todavía te sobra tiempo',
    'Ni te preocupes, falta mucho', 'Hay chance de echarse un cafecito',
    'Relax, la fecha está lejos', 'Con calma, que aún falta'
  ])[1 + floor(random() * 10)::int]
  where chill_message is null
    and deadline is not null
    and deadline >= current_date + 4
    and status not in ('Entregado', 'Finalizado');
