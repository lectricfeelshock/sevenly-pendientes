# Solicitudes de cambio

Anota aquí tus solicitudes de cambio, una por número. Cuando quieras que se
apliquen, dime algo como "lee el listado y aplica del 1 al 4". Cuando esté
hecho, marcaré cada solicitud aplicada como `[x]` y moveré su bloque a la
sección de Historial (no la borro por completo, para dejar rastro de lo que
se hizo).

## Pendientes

### 2. Biblioteca: recursos generales vs. individuales, compartir, y subir archivos
Hoy en Biblioteca solo el admin puede agregar recursos, y todos son
"generales" (le sirven a todo el equipo). Cambios deseados:

a. **Mantener "Recursos generales"**: los que sirven a todo el equipo.
   Por ahora los sigue agregando el admin (a futuro, cuando cada persona
   o gerente tenga su propia cuenta, cada gerente podrá agregar recursos
   generales para su propio equipo).
b. **Nueva sección "Mis recursos"**: recursos personales — los que yo
   agregué, más los que otros me compartieron.
c. **Botón "Agregar nuevo recurso" para cualquier usuario** (no solo
   admin), con título, descripción, y la opción de poner un link **o**
   subir un archivo.
d. **Investigar si es viable subir archivos** a donde sea que se
   guarden (hoy solo se agregan links a SharePoint por miedo a llenar el
   almacenamiento con archivos, sobre todo muchos archivos pequeños).
   Tipos de archivo permitidos: imágenes, PDFs, documentos (Word) y
   hojas de cálculo (Excel). Confirmar los límites de almacenamiento
   disponibles antes de habilitarlo.
e. **Los recursos nuevos son individuales por default**, con una opción
   "Compartir" para compartirlos con el equipo — al compartir, el
   recurso aparece también en "Mis recursos" de la gente con quien se
   compartió (sin volverse "general").
f. **Desde "Recursos generales"**, cada recurso debe tener un botón
   "Añadir a mis recursos" para copiarlo a la lista personal de quien lo
   ve.
g. **Buscador (lupa) dentro de Biblioteca**, que busque solo por:
   - Nombre del recurso
   - Etiqueta del recurso
   - Buscando tanto en "Recursos generales" como en "Mis recursos"
h. **La lupa del dashboard** (solicitud #1) también debe poder
   encontrar estos recursos de Biblioteca entre sus resultados.

### 8. Apartado de FAQ (dudas frecuentes)
Un apartado nuevo con preguntas frecuentes y sus respuestas, para que el
equipo pueda resolver dudas comunes sin tener que preguntar. Aún sin
definir bien — ni las preguntas, ni dónde vive dentro de la app (¿pestaña
propia? ¿dentro de Biblioteca? ¿accesible desde el menú de arriba?), ni
quién la puede editar. Lo dejo como opción por ahora; cuando lo tenga más
claro lo detallo.

### 10. Poder agregarte subtareas a ti mismo en un pendiente individual que te asignaron
En un pendiente **individual** que a mí me asignaron, que yo (el
asignado) pueda agregarme subtareas a mí mismo — es para poder dividir
mi propio pendiente general en partes más chicas, no para repartirlo
con nadie más (el pendiente se queda individual, solo se trata de
organizarme mejor).

## Historial (aplicadas)

<!-- Aquí se van moviendo las solicitudes ya aplicadas, con fecha y commit. -->

### [x] 1. Buscador en lupa con filtro avanzado (dashboard)
_Aplicada 2026-08-30 — PR #25._

Quitar la barra de búsqueda fija del dashboard. En su lugar, agregar un
ícono de lupa a la derecha de los filtros existentes. Al darle clic, se
abre una ventana con un campo de búsqueda.

La búsqueda debe ser completa, y poder filtrar pendientes por:
- **Nombres**: si escribo el nombre de alguien del equipo, deben salir
  todos MIS pendientes (los que yo solicité o me asignaron) donde esa
  persona aparece — como solicitante o como asignado.
- **Estados** (No iniciado, En progreso, Detenido, Terminado y entregado)
- **Urgencias** (Baja, Media, Alta, Urgente)
- **Categorías**
- **Títulos**
- **Tipos de pendiente** (individual, personal, colaborativo)
- **Palabras de fecha**: si escribo "hoy", que salga todo lo que vence
  hoy; si escribo "mañana", todo lo que vence mañana.

### [x] 3. Pestañas en Popups del admin: Nuevos / Programados / Historial
_Aplicada 2026-08-30 — PR #25._

Dentro del apartado "Popups" del dashboard de admin, agregar 3 filtros
(pestañas):

- **Nuevos**: popups que todavía se pueden editar y aún no tienen fecha
  de programación — sobre todo los que se le piden a Claude para
  anunciar algo o alguna actualización, listos para que el admin los
  revise y programe después.
- **Programados**: popups que ya tienen fecha/hora asignada pero aún no
  han salido.
- **Historial**: popups que ya salieron (ya se mostraron a la gente).
  Estos se borran automáticamente pasando 3 días desde que salieron.

### [x] 4. Recordatorios y mecánica de "finalizar pendiente" para el solicitante
_Aplicada 2026-08-30 — PR #25._

Varias piezas relacionadas con lo que pasa después de que le dan
"Entregado" a un pendiente, para que los solicitantes no se olviden de
finalizarlo. Aplica a todos los solicitantes (no solo admin).

a. **Notificación del botón "Avisar a solicitante"** (en el desglose del
   pendiente): que la notificación diga, título: `Te entregaron un
   pendiente`; descripción: `(Nombre del que mandó el aviso) ya entregó
   su pendiente, revísalo y dale finalizado. Al finalizar pendientes
   podrá sumarle al registro personal de (nombre del que mandó el
   aviso)`.

b. **Si nadie le dio clic a "Avisar a solicitante"**, y el pendiente
   sigue sin finalizarse, que le llegue una notificación al solicitante
   — título: `¿Pudiste revisarlo?`; descripción: `Tienes un pendiente
   entregado. Si ya todo ok, finalízalo`. Esta misma notificación
   también le debe llegar a quien sí le avisaron pero que aún no ha
   finalizado. Al darle clic a cualquiera de las dos notificaciones (la
   de "Te entregaron un pendiente" o la de "¿Pudiste revisarlo?"), debe
   abrir directo ese pendiente sin finalizar.

   _Ajustado 2026-08-30:_ no es a las 10 am del día siguiente — es
   **exactamente 24 horas después de entregado** (si se entregó el
   lunes a las 4 pm, la notificación llega el martes a las 4 pm), y es
   **una sola vez por pendiente**, no se repite aunque siga sin
   finalizarse. Si a la misma persona se le juntan más de 2 pendientes
   así al mismo tiempo, se agrupan en una sola notificación: "Tienes X
   pendientes entregados sin finalizar" — al darle clic, en vez de abrir
   un pendiente puntual, abre el dashboard filtrado en "Mis solicitudes"
   + "Entregado", para ver todos de un jalón.

c. **A los 4 días hábiles de entregado** (hábiles = lunes a viernes, sin
   contar sábado ni domingo) sin finalizarse, mostrarle al solicitante un
   pop up — título: `¿Ya los pudiste revisar?`; descripción: `Tienes
   estos pendientes sin finalizar, Recuerda que finalizarlos ayuda a
   llevar el control del progreso de tu equipo de trabajo.` — seguido de
   la lista de sus pendientes entregados sin finalizar. Cada uno de la
   lista se puede abrir en un desglose con: título, descripción,
   asignado (o el equipo completo si fue colaborativo), cuándo se
   solicitó, cuándo se entregó (si tuvo subtareas — incluidos los
   colaborativos — mostrar cuándo se entregó cada subtarea), y un botón
   "Finalizar pendiente". Al finalizarlo se desbloquea el botón
   "Descargar historial" que se ve en ese mismo desglose (hoy bloqueado
   hasta finalizar). Este pop up se puede cerrar/ignorar sin hacer nada.

   Este pop up se debe **programar con 2 días hábiles de anticipación**
   (o sea, en cuanto se sabe que va a hacer falta, no el mismo día que
   sale) para que aparezca en el apartado de Popups del admin (punto 3 —
   en "Programados") por si lo quiere revisar o editar antes de que
   salga. Si en esos últimos 2 días hábiles antes de la fecha programada
   el solicitante finaliza todos los pendientes que iban a aparecer en
   ese pop up, el pop up se cancela y se elimina automáticamente —
   incluso del apartado de Popups del admin.

d. **Auto-finalizado a los 7 días de entregado**: como el pop up del
   punto (c) se puede ignorar, que a los 7 días de entregado sin que el
   solicitante lo finalice, el pendiente se finalice automáticamente y
   se elimine de inmediato (no espera los 4 días del punto f — ese
   plazo es solo para cuando alguien le da al botón de finalizar a
   mano). El registro en "Mi actividad" del asignado se queda igual, vía
   `finalized_log`.

e. **Con qué fecha cuenta un pendiente finalizado** (sin etiqueta de
   "rezagado", solo la fecha): un pendiente finalizado siempre cuenta con
   la fecha en la que se entregó, no la que se finalizó.
   - En "Mi actividad": si entregué un pendiente el martes y me lo
     finalizan el viernes de esa misma semana, en "Mi actividad" cuenta
     como finalizado el martes (no el viernes) — el conteo de "hoy" no
     se mueve por eso. Si para cuando se finaliza el pendiente ya no
     cae dentro de la semana que se está mostrando (por ejemplo, lo
     finalizan hasta la siguiente semana), ya no aparece en "Mi
     actividad" en absoluto.
   - En la lista/reporte descargable de finalizados: siempre aparece con
     la fecha original de entrega, sin importar cuánto se haya tardado
     en finalizarse — ahí sí sigue apareciendo, nomás con esa fecha.

f. **Auto-eliminado a los 4 días de finalizado a mano**: cuando el
   solicitante le da al botón de "Finalizar pendiente" él mismo, ese
   pendiente se elimina automáticamente a los 4 días de haberse
   finalizado (el auto-finalizado del punto (d) no pasa por aquí — ese
   se borra de inmediato).

### [x] 5. Cambiar el engrane de "Mi actividad" por un botón "Ver perfil"
_Aplicada 2026-09-03 — PR #48._

En la ventana de "Mi actividad" (`ActivityPanel`), donde antes estaba el
ícono de engrane junto al nombre para ir al perfil, ahora hay un botón
que dice "Ver perfil". Lleva al mismo lugar de siempre (`/perfil`).

### [x] 7. Mover la leyenda "De hoy para hoy 💀" de junto al título a debajo del deadline
_Aplicada 2026-09-03 — PR #48._

Para el caso específico de que el solicitante creó el pendiente el
mismo día de la fecha límite que le puso (`request_date === deadline`),
la leyenda ("De hoy para hoy 💀") ya no aparece junto al título — ahora
sale debajo del deadline en ambos lugares: debajo del badge de fecha en
la tarjeta del dashboard, y debajo del campo de Deadline en el
desglose.

_Ajustado 2026-09-04:_ en la tarjeta del dashboard, cuando sale "De hoy
para hoy 💀" ya no sale también "¡Se entrega hoy!" junto al badge de
fecha — se evita el mensaje redundante, solo se ve "De hoy para hoy 💀".

### [x] 11. Quitar el botón "💡 Consejo" al marcar pendiente de frecuencia
_Aplicada 2026-09-03 — PR #48._

Al crear un pendiente **individual o colaborativo** y marcar la casilla
de "pendiente de frecuencia", ya no aparece el botón "💡 Consejo" en el
formulario (se quitó en ambos, junto con su ventana emergente).

### [x] 14. Restringir "Eliminar pendiente" a solo solicitante y admin
_Aplicada 2026-09-03 — PR #48._

El botón "Eliminar pendiente" del desglose ahora solo lo ve y puede
usar el solicitante del pendiente (o cualquiera de los
co-solicitantes) y el admin — el asignado ya no puede eliminarlo.

_Revertido 2026-09-05:_ vuelve a verlo y poder usarlo cualquiera con
acceso al desglose, como antes de esta solicitud.

### [x] 15. Poder editar la descripción del pendiente y de las subtareas ya creadas
_Aplicada 2026-09-03 — PR #48._

Ahora, desde el desglose, el solicitante puede editar (con un ícono de
lápiz) tanto la descripción del pendiente como la descripción de
cualquier subtarea ya creada — antes solo se podían definir al momento
de crearlos.

### [x] 6. Botón "Asignar cambios" en pendientes finalizados
_Aplicada 2026-09-04._

En el desglose de un pendiente ya finalizado, donde antes estaba el
botón de "Finalizar pendiente", el solicitante ve un botón nuevo:
"Asignar cambios".

- Al darle clic, sale una leyenda de confirmación: "Crearás un nuevo
  pendiente para solicitar estos cambios." con botones "Aceptar" y
  "Cancelar".
- Si le da "Cancelar", no pasa nada.
- Si le da "Aceptar", se abre la ventana normal de crear pendiente
  (puede ser individual, personal o colaborativo, como siempre lo
  decide quien lo crea), con el título fijo: el título del pendiente al
  que se le están pidiendo cambios (ese campo no se edita).
- Al crear ese nuevo pendiente, aparece junto a su título — tanto en la
  tarjeta del dashboard como en su desglose — la leyenda "Cambios Ronda
  1".
- Si ese nuevo pendiente también se finaliza y de nuevo se usa "Asignar
  cambios" sobre él, el siguiente pendiente que se crea sale con
  "Cambios Ronda 2" — y así, subiendo de número cada vez que se repite
  el ciclo.

### [x] 9. Convertir pendiente individual a colaborativo: abrir ventana completa en vez de solo agregar
_Aplicada 2026-09-04._

En el desglose de un pendiente **individual**, el botón "+" junto a
"Asignar a" ya no solo convierte el pendiente a colaborativo agregando
a una persona — ahora abre una ventana completa (como la de crear un
pendiente nuevo, pero solo la parte colaborativa) con los datos de este
pendiente:

- **Sin** las opciones de elegir entre individual/personal/colaborativo.
- **Título**: no se puede cambiar.
- **Descripción, categoría, deadline y urgencia**: sí se pueden editar.
- **Solicita (+)**: se sigue pudiendo agregar más gente, igual que antes.
- **Equipo de trabajo**: disponible, igual que al crear un pendiente
  colaborativo nuevo.
- **Subtareas**: también disponible, con la misma regla de siempre —
  hay que agregarle una subtarea a cada persona del equipo de trabajo.

### [x] 12. Rediseñar los filtros del dashboard
_Aplicada 2026-09-04._

Los filtros del dashboard ahora son 5: **Todos**, **Estado**,
**Urgencia**, **Categoría**, **Deadline**.

- **Todos**: muestra todos los pendientes (sin filtrar).
- **Estado**: al darle clic se abre un menú desplegable con todos los
  estados por separado (para filtrar por uno en específico), más
  "De mayor a menor" (agrupa Finalizados, Entregados, Detenidos, En
  progreso, No iniciado, en ese orden) y "De menor a mayor" (el orden
  inverso).
- **Urgencia**: igual, con todas las urgencias por separado, más
  "De mayor a menor" (Muy urgente, Urgente, Alta, Media, Baja) y
  "De menor a mayor" (el orden inverso).
- **Categoría**: menú desplegable con todas las categorías, para
  filtrar por una en específico.
- **Deadline**: menú desplegable con solo dos opciones — "De mayor a
  menor" (de la fecha más próxima a la más alejada) y "De menor a
  mayor" (el orden inverso).

En "Mis solicitudes", a un lado de "Todos", sigue estando la opción
"Programados" (como ya existía).

_Ajustado 2026-09-05:_ el filtro por default al entrar a la app ya no
es "Todos" — es "Estado: No iniciado", para que lo primero que se vea
sea lo que aún falta por arrancar.

### [x] 13. Que un solicitante pueda salirse (abandonar) un pendiente
_Aplicada 2026-09-04._

Un solicitante puede salirse de un pendiente — dejar de ser solicitante
de él — siempre y cuando ese pendiente tenga al menos otro solicitante
más (no se puede quedar sin nadie que lo solicite). Si el que se sale
es el solicitante principal, otro co-solicitante lo reemplaza
automáticamente.

_Ajustado 2026-09-05:_ el botón vive hasta abajo del desglose, junto a
"Eliminar pendiente" — se llama "Abandonar" y pide confirmación
("Dejarás de ser responsable de este pendiente.").
