# Propuestas de mejora

Aquí anoto ideas de features para Sevenly, basadas en (a) huecos que veo al
leer el código actual y (b) qué hacen apps similares de gestión de tareas en
equipo (Trello, Asana, ClickUp, Monday). No son solicitudes tuyas — son
sugerencias para que elijas cuáles vale la pena construir.

Mismo flujo que `CHANGES.md`: dime "implementa la 3 y la 7" (o el número que
sea) y la muevo de aquí al chat de trabajo. Si una idea no te interesa, dime
"descarta la 5" y la muevo a Descartadas con el motivo.

## Basadas en el código actual

### 1. Que "Cuenta" sirva de filtro de pendientes, no solo de dato de perfil
El onboarding (`CHANGES.md` #24) ya hace que cada persona elija a qué
cuenta(s) pertenece (`profiles.account_ids`, contra la tabla `accounts`:
hoy Sevenly, WorkHub, Ragasa, Mobil, 7-Eleven, Promanuez, Berel + las que
se hayan agregado) — pero esa misma solicitud lo dejó anotado como
pendiente: *"por ahora esta información solo se captura; todavía no se usa
como filtro de pendientes"*. Ningún pendiente (`tasks`) sabe todavía a qué
cuenta pertenece.

Propuesta: agregar `tasks.account_id` (uuid, nullable, referencia a
`accounts`), seleccionable al crear un pendiente junto a Categoría, y un
filtro nuevo "Cuenta" en la barra de filtros del dashboard — mismo patrón
que ya existe para Categoría (`CHANGES.md` #12). Así "todo lo de Mobil
esta semana" se contesta con un filtro, no buscando a mano.

### 2. Que los strikes se vean en algún lado
Desde que un pendiente vencido se auto-borra a los 7 días sin entregarse
(`CHANGES.md` #18c), se guarda un registro en una tabla `strikes`
(`user_id`, `task_title`, `created_at` — ya tiene 15 registros). La misma
solicitud que la creó lo dejó anotado: *"sin apartado en el perfil
todavía, para poder mostrarlo ahí más adelante"*. Hoy ese "más adelante"
sigue sin llegar — los strikes se acumulan de forma completamente
invisible, ni para quien los recibe ni para nadie más.

Propuesta mínima: en `/perfil`, una fila que muestre cuántos strikes
tienes y, al abrirla, la lista (título del pendiente + fecha) de cada
uno. Sin mecánica nueva — ningún castigo ni límite automático todavía,
solo que deje de ser invisible.

### 3. Vista de tablero (Kanban) por estado
Hoy los pendientes solo se ven en una lista agrupada por urgencia
(`app/dashboard/page.js`, `byUrgency`), filtrable por estado uno a la vez
(`CHANGES.md` #12). No hay una vista que muestre los 5 estados ("No
iniciado" / "En progreso" / "Detenido" / "Entregado" / "Finalizado") lado
a lado. Un botón junto a los filtros para alternar entre "Lista" (la
actual) y "Tablero" (columnas por estado, mismo diseño de tarjeta que ya
existe) daría una foto del avance del equipo de un vistazo — el patrón
más usado en Trello/Asana. Se puede empezar sin arrastrar-y-soltar (clic
para cambiar de estado, como ya funciona hoy) y agregar drag-and-drop
después si hace falta.

### 4. Archivos adjuntos reales en los comentarios de un pendiente
Hoy el botón "Archivos adjuntos" de un comentario (`extractCommentLinks`
en `app/dashboard/page.js`) solo detecta links pegados como texto — no
hay manera de subir un archivo de verdad desde ahí. Biblioteca ya resolvió
exactamente este problema para los recursos (`CHANGES.md` #2d): un bucket
de Supabase Storage (`resource-files`) que acepta imagen/PDF/Word/Excel
hasta 20 MB, dentro del 1 GB gratis del plan actual.

Propuesta: reusar ese mismo patrón para `task_comments` — un botón de
subir archivo en el cuadro de comentario, con su propio bucket (o el
mismo `resource-files`) y una columna `file_url` en `task_comments`. Se
vería inline en el hilo (miniatura si es imagen, chip de descarga si no).
Mismo cuidado que ya se anotó en su momento: revisar el uso de storage en
Supabase antes de que se acerque al límite gratuito si se suben muchos
archivos pesados.

## Pendientes de investigar más

<!-- Ideas a medio madurar, para no perderlas de vista sin comprometerme a nada todavía. -->

## Descartadas

<!-- Aquí muevo las que decidas no hacer, con el motivo. -->
