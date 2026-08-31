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

### 5. Programar pendiente (reemplaza "Pendiente de frecuencia")
Esta ya no es una idea mía — es la especificación que me diste, estructurada
a detalle. Reemplaza por completo el checkbox actual de "Pendiente de
frecuencia" (semanal únicamente) por un flujo nuevo de "Programar
pendiente", con fecha de solicitud programada y repetición opcional.

**1. Dónde vive en el formulario**
En el formulario de crear pendiente — tanto Individual como Colaborativo —,
justo después de la sección de Subtareas, en el lugar donde hoy está el
checkbox "Pendiente de frecuencia" va un botón: ícono de reloj + el texto
**"Programar pendiente"**.

Al darle clic, el formulario se reorganiza:
- Aparece **"Día programado"** — el mismo tipo de campo de fecha que ya se
  usa en el pop up de admin ("Día programado (opcional)").
- A un lado, **"Deadline General"** (el campo que ya existe hoy).
- Debajo de esos dos, **"Urgencia"** (el campo que ya existe hoy).

Junto al botón "Programar pendiente" (junto al reloj) aparece un menú
desplegable estilo Google Calendar. Por default dice **"No se repite"**, y
sus otras dos opciones son:
- **Cada semana**
- **Todos los meses**

**2. Cómo se calculan las fechas — es conteo de días, no día de la semana fijo**
La regla completa se explica mejor con el ejemplo que diste: Día
programado = 3 de septiembre (jueves), Deadline general = 8 de septiembre
— un rango de 5 días entre la solicitud y la entrega.

- **No se repite** → se crea un único pendiente: se solicita el 3 de
  septiembre, se entrega el 8.
- **Cada semana** → el pendiente se vuelve a solicitar cada jueves (el
  mismo día de la semana que tuvo la fecha original), y el deadline sigue
  siendo "5 días después de la solicitud" — que en este caso siempre cae
  en martes, porque una semana completa (7 días) no mueve el día de la
  semana. No es que el sistema sepa "el deadline es los martes": simplemente
  cuenta 5 días desde el jueves, y da la casualidad de que siempre aterriza
  en martes.
- **Todos los meses** → el pendiente se solicita el primer jueves de cada
  mes (la misma posición que tuvo el 3 de septiembre dentro de su mes: fue
  el primer jueves de septiembre). Aquí el deadline **ya no** cae siempre
  el mismo día de la semana — porque los meses no tienen un número exacto
  de semanas — pero sigue siendo la misma regla: 5 días después de la
  fecha en que se solicitó ese mes en particular.

Esta misma lógica de conteo de días aplica igual a las subtareas con
deadline propio, sea en pendiente Individual o Colaborativo. Ejemplo
completo, con una subtarea cuyo deadline original es el 5 de septiembre
(2 días después de la solicitud):

| | Solicitud | Deadline general | Deadline de la subtarea |
|---|---|---|---|
| Original | 3 sep (jueves) | 8 sep — **+5 días** | 5 sep — **+2 días** |
| Cada semana | cada jueves | siempre +5 días (cae martes) | siempre +2 días (cae sábado) |
| Todos los meses | 1er jueves de cada mes | +5 días después de esa solicitud (día de semana variable) | +2 días después de esa solicitud (día de semana variable) |

En resumen: lo único que se guarda al programar el pendiente es *cuántos
días* hay entre la solicitud y cada deadline (general y de cada subtarea).
Cada vez que se genera una nueva solicitud —el jueves que toque, o el
primer jueves del mes que toque— todos los deadlines se recalculan
sumando ese mismo número de días a la nueva fecha de solicitud.

**3. Dónde se ve — filtro "Programados"**
En la pestaña **"Mis solicitudes"**, justo después del filtro "Todos" (que
hoy ya existe en esa barra junto con No iniciado / En progreso / Detenido /
Entregado / Finalizado), aparece un nuevo filtro: **"Programados"**.

Ahí vive cualquier pendiente creado con "Programar pendiente" activado,
tenga o no repetición. Si el pendiente es de frecuencia (semanal o
mensual), no se van acumulando tarjetas viejas — es una sola tarjeta que
se mantiene ahí siempre, con la fecha de solicitud y los deadlines ya
actualizados a la próxima ocurrencia.

**4. Editar un pendiente programado**
Al darle clic a la tarjeta se abre una ventana de edición — el mismo
formato que ya usa el admin para editar un pop up, pero con la información
de este pendiente. Si se edita algo ahí, el cambio **solo afecta a esa
instancia**: no altera la regla de repetición ni las próximas veces que se
genere, si el pendiente es de frecuencia.

**5. Borrar un pendiente programado**
- Si el pendiente **no** tiene repetición ("No se repite"): el botón de
  borrar funciona como hoy — pide confirmación y borra ese único
  pendiente.
- Si el pendiente **sí** es de frecuencia: al darle borrar aparece una
  ventana con dos opciones:
  - **"Borrar"** → borra solo esta instancia; la próxima semana o mes se
    sigue generando normal.
  - **"Borrar pendientes programados"** → detiene la recurrencia por
    completo, no se vuelve a generar.
- Cualquiera de los dos botones de borrar pide confirmación antes de
  ejecutarse.

**6. Aplica igual a Individual y Colaborativo**
El botón "Programar pendiente" existe en ambos formularios de creación, y
si cualquiera de los dos tiene subtareas con deadline propio, esas
subtareas participan de la misma lógica de conteo de días del punto 2.

**7. Los pendientes de frecuencia que ya existen con el sistema viejo**
Los pendientes de frecuencia creados con la opción anterior (la que solo
sabía "cada semana en tal día") también deben aparecer en "Mis
solicitudes" → "Programados", para poder editarlos o borrarlos desde ahí
igual que los nuevos — que no se queden huérfanos en un sistema que ya no
existe en la pantalla.

**Pregunta abierta antes de construir esto, no algo que ya esté resuelto:**
el sistema viejo y el nuevo no guardan la información de la misma forma.
Lo viejo es una plantilla que solo sabe el día de la semana y cuántos días
después va el deadline, y cada semana genera un pendiente nuevo y
separado (cada uno con su propio registro). Lo nuevo es un "Día
programado" real más una sola tarjeta que se actualiza en su lugar. Antes
de dar por hecho que uno se puede convertir en el otro sin fricción, vale
la pena confirmar si van a convivir dos formatos por debajo (mostrando lo
viejo con una versión simplificada de la tarjeta) o si hay que migrar cada
plantilla vieja a una con "Día programado" real — y qué pasa con el
historial de pendientes que esa plantilla ya generó antes del cambio.
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

## Perfil dinámico de usuario (pedido explícito)

Estas sí las pediste directamente: opciones de cómo podría verse `/perfil`
como una tarjeta de perfil dinámica en vez del formulario de ajustes que es
hoy. Ahora mismo `app/perfil/page.js` solo deja editar Nombre, Usuario,
WhatsApp, Correo y Contraseña en una lista de filas — no hay una vista tipo
"tarjeta" con puesto, descripción, cuentas o contacto a la vista. Inspirado
en cómo lo resuelven Slack, Notion (directorio de equipo) y LinkedIn.

### 12. Encabezado tipo tarjeta arriba del formulario actual
Antes de la lista editable de campos, un bloque tipo portada: inicial del
nombre en un círculo de color (no hace falta subir foto todavía), Nombre
grande, `@usuario` debajo, y el puesto en cursiva debajo de eso. El
formulario de "Cambiar" que ya existe se queda igual, solo se le pone
encabezado visual arriba.

### 13. Campos nuevos: puesto y descripción del puesto
La tabla `profiles` hoy solo tiene `name`, `username`, `email`, `phone` y
`role` (admin/gerente/miembro, usado en `app/dashboard/page.js` para
permisos). Agregar dos columnas de texto libre — `job_title` ("Editor de
video", "Community Manager") y `job_description` (2-3 líneas: qué hace esa
persona en el equipo) — con su fila editable igual que las demás en
`/perfil`. `role` seguiría siendo el campo técnico de permisos; `job_title`
sería el que se muestra en la tarjeta.

### 14. "En qué cuentas estás" calculado automáticamente, no capturado a mano
En vez de un campo que hay que actualizar manualmente (y que se desactualiza),
calcularlo de los pendientes reales: agrupar `tasks` donde
`assigned_to_id =` ese usuario por `category` (las mismas categorías de
`DEFAULT_CATEGORIES` en `app/dashboard/page.js` — Video, Diseño, Guiones,
Briefs, o las que el equipo haya usado) de los últimos ~30 días, y mostrarlas
como chips: "Video · 4 pendientes", "Diseño · 2 pendientes". Se ve siempre
al día sin que nadie tenga que ir a actualizarlo.

### 15. Si "cuentas" son clientes y no categorías, aclarar esa palabra primero
Ojo: en el código actual "cuenta" no existe como concepto — lo más cercano
es `category` (Video/Diseño/Guiones/Briefs), que son tipos de trabajo, no
clientes. Si con "en qué cuentas estás" te refieres a qué **clientes o
marcas** lleva cada quien (y eso todavía no vive en ningún lado del
esquema), sería una tabla nueva `accounts` + `profile_accounts` en vez de
reusar `category`. Vale la pena confirmar antes de construir la 14 tal cual,
para no calcular el chip equivocado.

### 16. Contacto con iconos de acción, no solo texto
Hoy el correo y el WhatsApp se ven como texto plano en su fila de "Cambiar".
En la tarjeta de arriba, mostrar el teléfono y correo con icono clicable:
teléfono abre `https://wa.me/<phone>` (ya se usa ese mismo formato en el
botón de recordatorio de `app/dashboard/page.js`, línea ~1500) y el correo
abre `mailto:`. Así cualquiera del equipo puede escribirle a alguien desde
su perfil sin copiar/pegar el número.

### 17. Ver el perfil de un compañero, no solo el propio
Ahora mismo `/perfil` solo carga al usuario logueado
(`supabase.from("profiles").select("*").eq("id", user.id)`). Se podría hacer
`/perfil/[id]` para ver la tarjeta de cualquier miembro del equipo — sin
botones de "Cambiar" si no eres tú — accesible con un clic desde el nombre
del responsable en cualquier pendiente del dashboard. Útil para ver rápido
"¿a quién le hablo de Diseño?" sin preguntar en el chat.

### 18. Directorio de equipo (`/equipo`)
Una grilla con la tarjeta resumida (inicial, nombre, puesto, cuentas) de
cada perfil, reusando la lista de `profiles` que el dashboard ya trae para
el selector de "Asignar a". Sirve como mini organigrama del equipo y de
paso resuelve la navegación hacia la propuesta 17.

### 19. Estado rápido opcional (disponible / ocupado)
Un campo `status_emoji` + `status_text` tipo Slack ("🎬 grabando hasta las
3pm") que la persona actualiza ella misma desde su tarjeta. Opcional y de
baja prioridad frente a las anteriores — lo dejo anotado por si acaso
quieres ese nivel de detalle más adelante.

## Referencias visuales para el refresh general (limpio, bordes curvos)

También pedido directo: ejemplos de apps con un look moderno — limpio, con
bordes curvos — para inspirar el refresh visual completo, no solo el
perfil.

**Muestrario visual (las seis renderizadas, no solo descritas):**
https://claude.ai/code/artifact/4fd09627-aa8e-4c96-b01f-e3a762086d2a — la
tarjeta de perfil, chips y botones reales de Sevenly repetidos seis veces,
mismo color en todas, solo cambia el radio y la sombra por tratamiento
(20-25 abajo), más el token de radio sugerido (26).

Punto de partida: hoy el estilo (`C` palette repetida en
`app/dashboard/page.js` y `app/perfil/page.js`, tipografía Georgia serif
para títulos, mono uppercase para labels, `border` sin `rounded` en casi
todo — solo 7 usos de `rounded` en todo el código, todos en dashboard) es
más "hoja de periódico/ficha editorial" que "app moderna". Ninguna de estas
apps hay que copiarla completa, son referencia de rasgos puntuales.

### 20. Linear — tarjetas y botones con esquinas suaves, mucho aire
Radios pequeños y consistentes (6-8px), fondo casi blanco con un solo color
de acento, tipografía sans todo el tiempo (nada de mezclar serif + mono
como ahora), sombras casi imperceptibles en vez de bordes duros. Es la
referencia más cercana a "limpio pero no plano" para las tarjetas de
pendientes del dashboard.

### 21. Notion — tarjetas de perfil y bloques con radio mediano
Los bloques de contenido y las "person cards" de Notion usan radios más
grandes (10-12px) con un borde muy tenue de 1px, sin sombra. Encaja bien
con la tarjeta de perfil de las propuestas 12-19 — el encabezado con
inicial + nombre + puesto se vería como una card de Notion.

### 22. Airbnb — botones y chips totalmente redondeados (pill)
Los chips de categoría (`DEFAULT_CATEGORIES` en el selector de pendiente,
y los chips de cuentas de la propuesta 14) se verían más modernos como
"pills" (radio completo, `rounded-full`) en vez de las etiquetas
rectangulares con esquina recta que hay hoy en la línea ~728 de
`app/dashboard/page.js`.

### 23. Cash App / Revolut — bloques de color sólido con radio grande
Radios grandes (16-20px) en bloques de color plano (sin degradados), buen
contraste de texto. Útil como referencia para las tarjetas de resumen o
estadísticas si se construye la propuesta 6 (reportes de equipo).

### 24. Duolingo — botones sólidos con "borde de profundidad" y radio alto
Botones con esquinas muy redondeadas y un borde inferior más oscuro que da
sensación de botón físico (en vez del botón plano `background: C.spine`
que hoy se usa en `FieldActions` de `app/perfil/page.js`). Útil si además
del refresh visual quieres que los botones de acción se sientan más
"clicables".

### 25. Stripe Dashboard — mezcla de radios chicos y medianos, gris muy suave
En vez de un solo radio para todo, Stripe usa radios chicos (4-6px) en
inputs y filas de tabla, y medianos (8-10px) en tarjetas contenedoras. Como
`app/perfil/page.js` ya separa "fila" (`ProfileRow`) de "tarjeta", este
patrón de dos tamaños de radio se podría aplicar directo ahí sin rediseñar
la estructura.

### 26. Cómo aplicarlo sin rehacer toda la app
En vez de ir componente por componente a mano, definir el radio como token
en `tailwind.config.js` (`theme.extend.borderRadius`, ej. `sm: 6px`,
`md: 10px`, `full: 9999px`) y reemplazar los `className="border ..."`
sueltos por `rounded-md border ...` (o `rounded-full` en chips/botones) de
forma progresiva, empezando por `app/perfil/page.js` ya que es la pantalla
más chica y sirve de piloto antes de tocar todo `app/dashboard/page.js`.

## Pendientes de investigar más

- Automatizaciones tipo "si urgencia = Urgente y pasan 2 días sin
  respuesta, notifica al gerente" (Monday tiene un builder visual de
  reglas). Antes de proponerla en firme, valdría la pena confirmar si el
  equipo realmente necesita reglas configurables o si un par de reglas
  fijas (como ya existe con `remind_me`) es suficiente.

## Descartadas

<!-- Aquí muevo las que decidas no hacer, con el motivo. -->
