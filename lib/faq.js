// CHANGES.md #8: preguntas frecuentes de cómo usar la app (no de
// clientes/trabajo — eso es Biblioteca). Contenido fijo por ahora; si hace
// falta que alguien las edite desde la app, se construye aparte.
export const FAQ_ITEMS = [
  {
    q: "¿Cuál es la diferencia entre un pendiente Individual y uno Colaborativo?",
    a: "En un Individual, una persona lo solicita y se asigna a una sola persona (puedes incluso asignártelo a ti mismo). En uno Colaborativo, varias personas forman un equipo de trabajo y cada quien entrega su propia subtarea — el estado general del pendiente se calcula solo, según cómo van las subtareas del equipo.",
  },
  {
    q: "¿Por qué no puedo finalizar yo mismo un pendiente que me asignaron?",
    a: "Finalizar es el paso que confirma que el trabajo quedó bien, y por eso le toca a quien lo solicitó (o a un admin) — es su forma de darle el visto bueno antes de cerrarlo. Tú, como asignado, llegas hasta “Entregado”.",
  },
  {
    q: "Al crear un pendiente Individual, ¿tengo que ser yo quien lo solicita?",
    a: "No — en “Solicita” puedes agregar a diferentes personas del equipo como solicitantes, no solo a ti mismo. Por default aparece tu nombre, pero lo puedes cambiar por el de quien realmente lo está pidiendo, o sumar a alguien más además de ti; a cada quien le llega un aviso de que quedó como solicitante de ese pendiente.",
  },
  {
    q: "¿Cómo descargo mis pendientes en PDF?",
    a: "Dale clic derecho en cualquier parte de la pantalla de Pendientes (fuera de una tarjeta) y elige “Descargar Pendientes”. Se abre una ventana con casillas para elegir qué incluir (pestaña, Estado, Urgencia, Categoría, Cuenta, si cuentan los Programados) — al confirmar, se descarga un PDF con esos pendientes.",
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
    q: "El botón ya no dice “Nuevo pendiente”, ¿dónde quedó?",
    a: "Ahora solo dice “Nuevo”. Al darle clic, primero eliges si quieres crear un Pendiente o un Evento (para juntas, sesiones de fotos, coberturas...) — eligiendo “Pendiente” sigue el mismo formulario de siempre, sin nada que cambie.",
  },
  {
    q: "¿Cómo programo un pendiente para que arranque después, o se repita cada semana o mes?",
    a: "Al crear un pendiente Individual o Colaborativo, en “Se repite” elige “Cada semana” o “Todos los meses” — se abre el campo “Día programado”, donde eliges cuándo arranca. Mientras no llegue esa fecha, el pendiente vive en el filtro “Programados” (dentro de “Mis solicitudes”); en cuanto llega, se publica solo y queda asignado como cualquier otro. Si elegiste repetición, la siguiente ocurrencia se genera sola después de cada una.",
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
