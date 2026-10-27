// CHANGES.md #8: preguntas frecuentes de cómo usar la app (no de
// clientes/trabajo — eso es Biblioteca). Contenido fijo por ahora; si hace
// falta que alguien las edite desde la app, se construye aparte.
export const FAQ_ITEMS = [
  {
    q: "¿Cuál es la diferencia entre un pendiente Individual y uno Colaborativo?",
    a: "En un Individual, una persona lo solicita y se asigna a una sola persona (puedes incluso asignártelo a ti mismo). En uno Colaborativo, varias personas forman un equipo de trabajo y cada quien entrega su propia subtarea — el estado general del pendiente se calcula solo, según cómo van las subtareas del equipo.",
  },
  {
    q: "¿Ya no existe el tipo de pendiente “Personal”? ¿Cómo me asigno algo a mí mismo ahora?",
    a: "Así es, ya no se pueden crear pendientes nuevos de tipo Personal (los que ya existían se quedan igual, nada más cambia para ellos). Ahora se hace con un Individual: al crearlo, elige tu propio nombre tanto en “Solicita” como en “Asignar a”, y te queda igual que antes — un pendiente para ti mismo.",
  },
  {
    q: "Ya le di “Entregado” a mi pendiente, ¿y ahora qué pasa?",
    a: "En cuanto lo marcas como entregado, le llega automáticamente una notificación a quien lo solicitó (“Te entregaron un pendiente”) para que lo revise y lo finalice — no tienes que avisarle aparte.",
  },
  {
    q: "¿Por qué no puedo finalizar yo mismo un pendiente que me asignaron?",
    a: "Finalizar es el paso que confirma que el trabajo quedó bien, y por eso le toca a quien lo solicitó (o a un admin) — es su forma de darle el visto bueno antes de cerrarlo. Tú, como asignado, llegas hasta “Entregado”.",
  },
  {
    q: "Al crear un pendiente Individual, ¿tengo que ser yo quien lo solicita?",
    a: "No — en “Solicita” puedes elegir a cualquiera del equipo como solicitante principal, no solo a ti. Por default aparece tu nombre, pero lo puedes cambiar; a esa persona le llega un aviso de que quedó como solicitante del pendiente.",
  },
  {
    q: "¿Cómo descargo mis pendientes en PDF?",
    a: "Dale clic derecho en cualquier parte de la pantalla de Pendientes (fuera de una tarjeta) y elige “Descargar Pendientes”. Se abre una ventana con casillas para elegir qué incluir (pestaña, Estado, Urgencia, Categoría, Cuenta, si cuentan los Programados) — al confirmar, se descarga un PDF con esos pendientes.",
  },
  {
    q: "¿Cómo sé si alguien de mi equipo está en línea?",
    a: "Cuando alguien con quien compartes al menos una cuenta se conecta, te sale un aviso que baja desde arriba de la pantalla. También puedes abrir “Mi equipo” — quien esté en línea en ese momento tiene un puntito verde junto a su nombre.",
  },
  {
    q: "¿Cómo funcionan las subtareas en un pendiente Colaborativo?",
    a: "Cada persona del equipo de trabajo necesita su propia subtarea — si a alguien no se le asigna una, no va a poder marcar su parte como entregada, así que la app no te deja crear el pendiente hasta que todos tengan la suya. El estado general se mueve solo: pasa a “Entregado” hasta que TODAS las subtareas del equipo queden entregadas.",
  },
  {
    q: "¿Cómo encuentro rápido un pendiente o un recurso?",
    a: "En el dashboard, el ícono de lupa abre un buscador completo: por nombre, solicitante o asignado, estado, urgencia, categoría, o palabras como “hoy” / “mañana” para el deadline. Ese mismo buscador también encuentra recursos de Biblioteca; Biblioteca además tiene su propia lupa, por nombre y etiqueta.",
  },
  {
    q: "¿Qué son las “cuentas” y el “puesto” que me pidió la app al entrar?",
    a: "“Cuentas” son los clientes o marcas en los que trabajas (por ejemplo Sevenly, WorkHub, Ragasa...) y “puesto” es tu rol dentro del equipo. Se piden la primera vez que entras, pero no quedan fijos: puedes agregarte más cuentas, quitarte alguna, o cambiar tu puesto cuando quieras desde tu Perfil.",
  },
  {
    q: "¿Cómo activo las notificaciones push?",
    a: "Dale clic al ícono de la campana (arriba, junto al buscador). Si tu navegador las soporta, vas a ver un botón “Activar” — dale clic y acepta el permiso que te pida el navegador. Desde ahí te van a llegar avisos aunque no tengas la app abierta.",
  },
  {
    q: "¿Cómo filtro mis pendientes por cuenta?",
    a: "Dale clic a la flecha junto al título “Pendientes”, arriba del todo. Se abre un menú con “Todas las cuentas” y cada una de las tuyas — al elegir una, la lista se filtra solo a los pendientes de esa cuenta.",
  },
];

// CHANGES.md #8c: la burbuja flota de nuevo cada lunes, sin importar si se
// había cerrado la semana pasada — comparamos contra el lunes más reciente.
export function mostRecentMonday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = domingo ... 6 = sábado
  const diff = day === 0 ? 6 : day - 1; // días desde el lunes
  d.setDate(d.getDate() - diff);
  return d;
}

export function shouldFloatFaqBubble(dismissedAt) {
  if (!dismissedAt) return true;
  return new Date(dismissedAt) < mostRecentMonday();
}
