"use client";
import { useEffect, useState } from "react";
import { C, R, SH } from "@/lib/theme";

const SHOW_MS = 4000;
const SLIDE_MS = 300;

// CHANGES.md #28: aviso tipo "push" cuando un compañero con quien
// comparates cuenta se conecta — no es notificación de campanita (no se
// guarda, no suma al contador). Baja desde arriba y se oculta sola.
export default function OnlineBanner({ queue, onDequeue }) {
  const [visible, setVisible] = useState(false);
  const current = queue[0] || null;

  useEffect(() => {
    if (!current) { setVisible(false); return; }
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), SHOW_MS);
    const dequeueTimer = setTimeout(() => onDequeue(), SHOW_MS + SLIDE_MS);
    return () => { clearTimeout(hideTimer); clearTimeout(dequeueTimer); };
  }, [current?.id, current?.at]);

  if (!current) return null;

  return (
    <div
      className="fixed left-1/2 z-[70] px-4 py-3 flex items-center gap-2.5"
      style={{
        top: visible ? 16 : -80,
        transform: "translateX(-50%)",
        background: C.ink, color: C.paper,
        borderRadius: R.lg, boxShadow: SH.floatLg,
        transition: `top ${SLIDE_MS}ms ease`,
        minWidth: 220, maxWidth: "min(92vw, 360px)",
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: R.pill, background: "#4ADE80", flexShrink: 0 }} />
      <span className="text-sm font-medium truncate">{current.name} está en línea</span>
    </div>
  );
}
