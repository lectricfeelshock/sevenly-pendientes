# Propuestas de mejora

Aquí anoto ideas de features para Sevenly, basadas en (a) huecos que veo al
leer el código actual y (b) qué hacen apps similares de gestión de tareas en
equipo (Trello, Asana, ClickUp, Monday). No son solicitudes tuyas — son
sugerencias para que elijas cuáles vale la pena construir.

Mismo flujo que `CHANGES.md`: dime "implementa la 3 y la 7" (o el número que
sea) y la muevo de aquí al chat de trabajo. Si una idea no te interesa, dime
"descarta la 5" y la muevo a Descartadas con el motivo.

## Basadas en el código actual

### 1. Recordatorios y correos automáticos por deadline
Hoy el botón de aviso por correo es manual (visto en el flujo de deadlines
del dashboard). Ya existe un cron de Vercel para tareas recurrentes
(`app/api/generate-recurring/route.js`) — se puede agregar otro cron diario
que revise `tasks.deadline` y mande el correo solo cuando falten N días,
sin que nadie tenga que acordarse de darle click.

### 2. Vista de tablero (Kanban) por estado
Ahora mismo los pendientes se listan agrupados por urgencia
(`app/dashboard/page.js`, `byUrgency`). Una vista alterna en columnas por
`status` ("No iniciado" / "En progreso" / "Detenido" / "Terminado y
entregado") con drag-and-drop para cambiar de estado daría una foto más
rápida del avance del equipo — es el patrón más usado en Trello/Asana.

### 3. Vista de calendario para deadlines
Todos los pendientes con `deadline` puestos en un calendario mensual, para
ver de un vistazo qué semana está saturada. Se puede reusar la lógica de
`dueLegend()` para pintar los días según qué tan cerca está la fecha.

### 4. Etiquetas libres además de categoría
Hoy cada pendiente tiene una sola `category` fija (ver
`DEFAULT_CATEGORIES`). Agregar tags de colores libres (como Trello)
permitiría filtrar cruzando categorías, por ejemplo "todo lo de
Instagram" sin importar si es de Marketing o de Diseño.

### 5. Recurrencia más flexible
`recurring_templates` hoy solo soporta "cada semana en tal día"
(`weekday`). Ampliarlo a quincenal/mensual o "cada N días" cubriría cosas
como pagos mensuales o reportes quincenales que hoy no se pueden
automatizar.

### 6. Reportes básicos de equipo
Con los datos que ya existen (`completed_at`, `assigned_to_id`,
`status`) se puede armar un panel simple: pendientes entregados por
persona en la semana, cuántos están vencidos, tiempo promedio entre
`request_date` y `completed_at`. Útil para juntas de seguimiento sin
exportar nada a mano.

### 7. Exportar a Excel/PDF
Botón para exportar la vista filtrada actual (por ejemplo "Todos los
pendientes de Marketing de este mes") a Excel o PDF, para compartir
avances fuera de la app.

## Basadas en apps similares (Trello, Asana, ClickUp, Monday)

### 8. Dependencias entre pendientes
En Asana un pendiente puede "esperar" a que otro se termine primero. Con
el esquema actual bastaría una tabla `task_dependencies (task_id,
depends_on_task_id)` y bloquear el cambio a "Terminado y entregado" si la
dependencia sigue abierta.

### 9. Archivos adjuntos en comentarios
Hoy solo las "popups" de admin permiten subir una imagen
(`handlePopupImage`). Permitir adjuntar archivos/imágenes en los
comentarios de cualquier pendiente (como Trello/ClickUp) ayuda a compartir
referencias sin salir de la app.

### 10. Time tracking simple
Campo opcional de "tiempo estimado" al crear el pendiente y "tiempo real"
al marcarlo entregado (ClickUp lo hace así). Sirve para ver si las
estimaciones del equipo son realistas con el tiempo.

### 11. PWA instalable
Ya hay push notifications funcionando (`web-push`, `enablePush` en el
dashboard). Falta el manifest + service worker para que se pueda
"instalar" la app en el celular como ícono, en vez de abrirla siempre
desde el navegador.

## Pendientes de investigar más

- Automatizaciones tipo "si urgencia = Urgente y pasan 2 días sin
  respuesta, notifica al gerente" (Monday tiene un builder visual de
  reglas). Antes de proponerla en firme, valdría la pena confirmar si el
  equipo realmente necesita reglas configurables o si un par de reglas
  fijas (como ya existe con `remind_me`) es suficiente.

## Descartadas

<!-- Aquí muevo las que decidas no hacer, con el motivo. -->
