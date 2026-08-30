# Solicitudes de cambio

Anota aquí tus solicitudes de cambio, una por número. Cuando quieras que se
apliquen, dime algo como "lee el listado y aplica del 1 al 4". Cuando esté
hecho, marcaré cada solicitud aplicada como `[x]` y moveré su bloque a la
sección de Historial (no la borro por completo, para dejar rastro de lo que
se hizo).

## Pendientes

### 1. Buscador en lupa con filtro avanzado (dashboard)
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

### 3. Pestañas en Popups del admin: Nuevos / Programados / Historial
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

### 4. Recordatorios y mecánica de "finalizar pendiente" para el solicitante
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
   a las 10 am del día siguiente — título: `¿Pudiste revisarlo?`;
   descripción: `Tienes un pendiente entregado. Si ya todo ok,
   finalízalo`. Esta misma notificación de las 10 am también le debe
   llegar a quien sí le avisaron pero que aún no ha finalizado. Al darle
   clic a cualquiera de las dos notificaciones (la de "Te entregaron un
   pendiente" o la de "¿Pudiste revisarlo?"), debe abrir directo ese
   pendiente sin finalizar.

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
   se elimine. *(Ojo: confirmar qué significa exactamente "se elimine"
   aquí — si es borrar el registro del pendiente por completo, o solo
   quitarlo de la lista de pendientes por finalizar/de los recordatorios
   — antes de implementarlo, para no perder historial por accidente.)*

e. **Cómo cuentan estos pendientes rezagados**: si un pendiente se
   entrega un día pero el solicitante lo finaliza hasta después, debe
   sumar a "Mi actividad" de quien lo entregó el día en que el
   solicitante por fin lo finaliza (no el día que se entregó). Pero al
   descargar la lista/reporte de finalizados, ese pendiente debe
   aparecer con la fecha en que originalmente se entregó (no la fecha en
   que se finalizó), con una etiqueta `Rezagado`. Esto solo aplica si el
   pendiente se quedó en "Entregado" todo ese tiempo (si en el camino
   regresó a "En progreso" y se volvió a entregar, ya no cuenta como
   rezagado).

f. **Auto-eliminado a los 4 días de finalizado**: un pendiente ya
   finalizado (con "Terminado y entregado", sea que lo haya finalizado
   el solicitante a mano o por el auto-finalizado del punto (d)) se
   elimina automáticamente a los 4 días de haberse finalizado. *(Esto
   puede resolver la duda que dejé en el punto (d) sobre qué tan literal
   era "se elimine" ahí — a confirmar juntos antes de implementar para
   no duplicar o encimar las dos reglas de borrado.)*

### 5. Cambiar el engrane de "Mi actividad" por un botón "Ver perfil"
En la ventana de "Mi actividad" (`ActivityPanel`), donde hoy está el
ícono de engrane junto al nombre para ir al perfil, quitar el engrane y
poner en su lugar un botón que diga "Ver perfil". Debe llevar al mismo
lugar de siempre (`/perfil`), solo cambia de ícono+link a un botón con
texto.

### 6. Botón "Asignar cambios" en pendientes finalizados
En el desglose de un pendiente ya finalizado, justo donde antes estaba
el botón de "Finalizar pendiente", el solicitante debe ver un botón
nuevo: "Asignar cambios".

- Al darle clic, sale una leyenda de confirmación: "Crearás un nuevo
  pendiente para solicitar estos cambios." con botones "Aceptar" y
  "Cancelar".
- Si le da "Cancelar", no pasa nada.
- Si le da "Aceptar", se abre la ventana normal de crear pendiente
  (puede ser individual, personal o colaborativo, como siempre lo
  decide quien lo crea), pero con el título fijo: el título del
  pendiente al que se le están pidiendo cambios (ese campo no se
  edita).
- Al crear ese nuevo pendiente, debe aparecer junto a su título — tanto
  en la tarjeta del dashboard como en su desglose — la leyenda "Cambios
  Ronda 1".
- Si ese nuevo pendiente ("Cambios Ronda 1") también se finaliza y de
  nuevo se usa "Asignar cambios" sobre él, el siguiente pendiente que se
  cree sale con "Cambios Ronda 2" — y así, subiendo de número cada vez
  que se repite el ciclo.

### 7. Mover la leyenda "De hoy para hoy 💀" de junto al título a debajo del deadline
Es para el caso específico de que el solicitante creó el pendiente el
mismo día de la fecha límite que le puso (`request_date === deadline`).
Hoy esa leyenda ("De hoy para hoy 💀") aparece junto al título — tanto en
la tarjeta del pendiente en el dashboard como en el encabezado del
desglose. Quitarla de ahí y ponerla debajo del deadline en ambos
lugares: debajo del badge de fecha en la tarjeta, y debajo del campo de
Deadline en el desglose.

## Historial (aplicadas)

<!-- Aquí se van moviendo las solicitudes ya aplicadas, con fecha y commit. -->
