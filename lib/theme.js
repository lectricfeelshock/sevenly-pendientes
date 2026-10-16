// Sistema de diseño compartido ("Papel suave") — paleta, radios y sombras
// usados por todas las pantallas. Mismos nombres de token que antes
// (C.paper, C.ink, C.inkSoft, ...) para no tener que tocar cada punto de
// uso; solo cambian los valores y se agregan un par de tonos nuevos.
export const C = {
  paper: "#F6F3ED",
  panel: "#FFFFFF",
  subtle: "#F1EDE5",
  ink: "#1B1E24",
  inkMedium: "#4A4F59",
  inkSoft: "#7C818B",
  inkFaint: "#B0ABA2",
  hairline: "#E7E1D6",
  hairlineSoft: "#F1EDE5",
  signal: "#2F7D68",
  signalSoft: "#E6F0EC",
  amber: "#C08A2E",
  amberSoft: "#F7EEDD",
  amberInk: "#A9761F",
  urgent: "#C0553F",
  urgentSoft: "#F8E8E3",
  urgentInk: "#B14C37",
  gray: "#9AA0A8",
  spine: "#1B1E24",
  overdueInk: "#F6F3ED",
  overdueInkSoft: "#B0ABA2",
};

// Escala de radios. Los componentes casi siempre usan R.pill (chips,
// botones, avatares) o R.lg (tarjetas); R.sm/md quedan para inputs chicos.
export const R = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 20,
  xxl: 24,
  pill: 999,
};

// Sombras reutilizables.
export const SH = {
  soft: "0 1px 2px rgba(27,30,36,0.04)",
  card: "0 1px 2px rgba(27,30,36,0.04), 0 8px 22px rgba(27,30,36,0.055)",
  float: "0 6px 16px rgba(27,30,36,0.20)",
  floatLg: "0 10px 24px rgba(27,30,36,0.22)",
  nav: "0 -1px 0 #ECE7DD, 0 -10px 28px rgba(27,30,36,0.05)",
};

export const FONT_SERIF = "Newsreader, Georgia, serif";
