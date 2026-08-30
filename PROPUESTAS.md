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
perfil. Punto de partida: hoy el estilo (`C` palette repetida en
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
