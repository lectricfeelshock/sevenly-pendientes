// PDF de "Mi actividad" (lista de finalizados / entregados) con el estilo de
// la app ("Papel suave"): fondo papel, tarjetas blancas, serif en el título.
// Se genera en el navegador con jsPDF; no usa IA ni servidor.
import { C } from "@/lib/theme";

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const fmt = (iso) => new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// rows: [{ title, at }] ya ordenadas; kind: "finalizados" | "entregados"
export async function downloadActivityPdf({ name, kind, rows, subtitle, filename }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const fill = (c) => doc.setFillColor(...hex(c));
  const ink = (c) => doc.setTextColor(...hex(c));

  const page = () => { fill(C.paper); doc.rect(0, 0, W, H, "F"); };
  const header = () => {
    page();
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); ink(C.inkSoft);
    doc.text("T E R R E G A L", M, 44);
    doc.setFont("times", "bold"); doc.setFontSize(26); ink(C.ink);
    doc.text(kind === "entregados" ? "Pendientes entregados" : "Pendientes finalizados", M, 78);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(C.inkMedium);
    doc.text(name, M, 98);
    ink(C.inkSoft); doc.setFontSize(10);
    doc.text(`${subtitle} · Generado el ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`, M, 114);
    // chip con el total
    fill(C.signalSoft); doc.roundedRect(M, 130, W - 2 * M, 36, 10, 10, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); ink(C.signal);
    doc.text(`${rows.length} ${kind === "entregados" ? "entregado(s)" : "finalizado(s)"}`, M + 16, 153);
    return 186;
  };

  let y = header();
  const cardH = 44;
  if (!rows.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(C.inkSoft);
    doc.text("No hay pendientes en este periodo.", M, y + 10);
  }
  rows.forEach((r) => {
    if (y + cardH > H - 50) { doc.addPage(); page(); y = 40; }
    // tarjeta blanca con borde suave
    fill(C.panel); doc.setDrawColor(...hex(C.hairline)); doc.setLineWidth(0.6);
    doc.roundedRect(M, y, W - 2 * M, cardH, 10, 10, "FD");
    fill(C.signal); doc.roundedRect(M + 12, y + 12, 4, cardH - 24, 2, 2, "F");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(C.inkSoft);
    doc.text(fmt(r.at), M + 26, y + 17);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); ink(C.ink);
    const title = doc.splitTextToSize(String(r.title || ""), W - 2 * M - 52)[0] || "";
    doc.text(title, M + 26, y + 33);
    y += cardH + 8;
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(C.inkFaint);
    doc.text(`Página ${i} de ${n}`, W - M, H - 24, { align: "right" });
    doc.text("Terregal · Mi actividad", M, H - 24);
  }
  doc.save(filename);
}

// CHANGES.md #27: "Descargar Pendientes" desde el menú de clic derecho —
// mismo estilo "Papel suave" que downloadActivityPdf, pero para cualquier
// combinación de pendientes (no solo finalizados/entregados).
// rows: [{ title, meta }] ya filtradas y ordenadas.
export async function downloadTasksPdf({ name, rows, subtitle, filename }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const fill = (c) => doc.setFillColor(...hex(c));
  const ink = (c) => doc.setTextColor(...hex(c));

  const page = () => { fill(C.paper); doc.rect(0, 0, W, H, "F"); };
  const header = () => {
    page();
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); ink(C.inkSoft);
    doc.text("T E R R E G A L", M, 44);
    doc.setFont("times", "bold"); doc.setFontSize(26); ink(C.ink);
    doc.text("Pendientes", M, 78);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(C.inkMedium);
    doc.text(name, M, 98);
    ink(C.inkSoft); doc.setFontSize(10);
    doc.text(`${subtitle} · Generado el ${new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`, M, 114);
    fill(C.signalSoft); doc.roundedRect(M, 130, W - 2 * M, 36, 10, 10, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); ink(C.signal);
    doc.text(`${rows.length} pendiente(s)`, M + 16, 153);
    return 186;
  };

  let y = header();
  const cardH = 58;
  if (!rows.length) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(C.inkSoft);
    doc.text("No hay pendientes que coincidan con los filtros elegidos.", M, y + 10);
  }
  rows.forEach((r) => {
    if (y + cardH > H - 50) { doc.addPage(); page(); y = 40; }
    fill(C.panel); doc.setDrawColor(...hex(C.hairline)); doc.setLineWidth(0.6);
    doc.roundedRect(M, y, W - 2 * M, cardH, 10, 10, "FD");
    fill(C.signal); doc.roundedRect(M + 12, y + 12, 4, cardH - 24, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); ink(C.ink);
    const title = doc.splitTextToSize(String(r.title || ""), W - 2 * M - 52)[0] || "";
    doc.text(title, M + 26, y + 20);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); ink(C.inkSoft);
    doc.text(String(r.meta || ""), M + 26, y + 38);
    y += cardH + 8;
  });

  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(C.inkFaint);
    doc.text(`Página ${i} de ${n}`, W - M, H - 24, { align: "right" });
    doc.text("Terregal · Pendientes", M, H - 24);
  }
  doc.save(filename);
}

const fmtEventDateLong = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }) : "";
const fmtEventTimeShort = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hh = ((+h + 11) % 12) + 1;
  return `${hh}:${m} ${+h < 12 ? "am" : "pm"}`;
};

// CHANGES.md #35: resumen de un evento (Junta, Sesión de Fotos, Cobertura...)
// — mismo estilo "Papel suave" que el resto de los PDFs de la app.
export async function downloadEventSummaryPdf({ event, summary, filename }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const fill = (c) => doc.setFillColor(...hex(c));
  const ink = (c) => doc.setTextColor(...hex(c));
  const page = () => { fill(C.paper); doc.rect(0, 0, W, H, "F"); };

  page();
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); ink(C.inkSoft);
  doc.text("T E R R E G A L", M, 44);
  doc.setFont("times", "bold"); doc.setFontSize(24); ink(C.ink);
  const titleLines = doc.splitTextToSize(event.title, W - 2 * M);
  doc.text(titleLines, M, 78);
  let y = 78 + titleLines.length * 24 + 6;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); ink(C.inkSoft);
  const when = `${fmtEventDateLong(event.event_date)}${event.start_time ? " · " + fmtEventTimeShort(event.start_time) : ""}`;
  doc.text(`${event.category || "Evento"} · ${when}`, M, y);
  y += 30;

  fill(C.panel); doc.setDrawColor(...hex(C.hairline)); doc.setLineWidth(0.6);
  doc.roundedRect(M, y, W - 2 * M, H - y - 60, 12, 12, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); ink(C.inkSoft);
  doc.text("RESUMEN", M + 18, y + 24);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); ink(C.ink);
  const body = doc.splitTextToSize(summary || "(sin resumen)", W - 2 * M - 36);
  doc.text(body, M + 18, y + 46);

  doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); ink(C.inkFaint);
  doc.text("Terregal · Resumen de evento", M, H - 24);
  doc.save(filename);
}
