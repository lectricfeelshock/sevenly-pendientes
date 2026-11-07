// Frases del deadline "lejano" (faltan 4 días o más). Cada pendiente queda
// "marcado" con una de estas en tasks.chill_message: se escoge al crearlo y
// otra vez cada vez que alguien mueve su deadline, para que haya variación
// pero el mismo pendiente no cambie de frase cada vez que se pinta.
export const CHILL_MESSAGES = [
  "Todo chill, aún falta",
  "Tranqui, hay tiempo",
  "Vas sobrado de tiempo",
  "Respira, aún hay margen",
  "Sin prisa, por ahora",
  "Todavía te sobra tiempo",
  "Ni te preocupes, falta mucho",
  "Hay chance de echarse un cafecito",
  "Relax, la fecha está lejos",
  "Con calma, que aún falta",
];
export const CHILL_MIN_DAYS = 4;
export const CHILL_DEFAULT = CHILL_MESSAGES[0]; // para pendientes viejos aún sin marca

function daysFromToday(iso) {
  const dt = new Date(iso + "T00:00:00");
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.round((dt - now) / 86400000);
}

// Devuelve el valor de `chill_message` que le toca a un pendiente con este
// deadline: una frase de la lista si faltan 4+ días (distinta de la actual,
// si se puede), o null si no está en ese margen.
export function pickChillMessage(deadline, current = null) {
  if (!deadline || daysFromToday(deadline) < CHILL_MIN_DAYS) return null;
  const options = CHILL_MESSAGES.filter((m) => m !== current);
  return options[Math.floor(Math.random() * options.length)];
}
