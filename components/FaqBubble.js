"use client";
import { useEffect, useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { C, SH } from "@/lib/theme";
import { shouldFloatFaqBubble } from "@/lib/faq";
import FaqModal from "./FaqModal";

const DRAG_THRESHOLD = 6; // px — menos que esto todavía cuenta como "clic", no arrastre
const BUBBLE_SIZE = 40;
const TARGET_SIZE = 54;
const POS_KEY = "faq_bubble_pos";
const DESKTOP_BREAKPOINT = 768;

const clampFrac = (v) => Math.min(0.88, Math.max(0.12, v));

// Dado el punto donde se soltó la burbuja, elige el borde de pantalla más
// cercano (izquierda/derecha/arriba/abajo) y la posición dentro de ese borde.
function nearestEdge(clientX, clientY) {
  const w = window.innerWidth, h = window.innerHeight;
  const distances = { left: clientX, right: w - clientX, top: clientY, bottom: h - clientY };
  const edge = Object.keys(distances).reduce((a, b) => (distances[a] <= distances[b] ? a : b));
  const frac = edge === "left" || edge === "right" ? clampFrac(clientY / h) : clampFrac(clientX / w);
  return { edge, frac };
}

// Convierte {edge, frac} en estilo `position: fixed`. En escritorio deja
// espacio para la barra lateral (izquierda) y en móvil para la barra
// inferior (abajo), para no quedar tapada por la navegación.
function dockStyle(pos) {
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= DESKTOP_BREAKPOINT;
  const leftOffset = isDesktop ? 264 : 16;
  const bottomOffset = isDesktop ? 16 : 90;
  const pct = `${pos.frac * 100}%`;
  switch (pos.edge) {
    case "left":
      return { left: leftOffset, top: pct, transform: "translateY(-50%)" };
    case "top":
      return { top: 16, left: pct, transform: "translateX(-50%)" };
    case "bottom":
      return { bottom: bottomOffset, left: pct, transform: "translateX(-50%)" };
    default:
      return { right: 16, top: pct, transform: "translateY(-50%)" };
  }
}

// CHANGES.md #8 (ajuste): burbuja flotante de ayuda — círculo negro con "?"
// que se puede arrastrar y soltar en cualquier borde de la pantalla
// (izquierda, derecha, arriba o abajo), o arrastrar hacia la "x" para
// cerrarla. La posición elegida se recuerda en este dispositivo. Si se
// cierra, deja de flotar hasta el próximo lunes (ver shouldFloatFaqBubble);
// mientras tanto, en el dashboard queda un ícono chico junto a la campana
// para seguir llegando al FAQ (eso vive en app/dashboard/page.js, no aquí).
export default function FaqBubble({ profile, onDismiss }) {
  const [pos, setPos] = useState({ edge: "right", frac: 0.58 });
  const [dragging, setDragging] = useState(false);
  const [dragPoint, setDragPoint] = useState(null);
  const [showTarget, setShowTarget] = useState(false);
  const [overTarget, setOverTarget] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const bubbleRef = useRef(null);
  const targetRef = useRef(null);
  const dragInfo = useRef({ moved: false });

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.frac === "number" && ["left", "right", "top", "bottom"].includes(parsed.edge)) {
        setPos(parsed);
      }
    } catch {}
  }, []);

  if (!profile || !shouldFloatFaqBubble(profile.faq_bubble_dismissed_at)) return null;

  const savePos = (next) => {
    setPos(next);
    try { window.localStorage.setItem(POS_KEY, JSON.stringify(next)); } catch {}
  };

  const isOverTarget = (clientX, clientY) => {
    if (!targetRef.current) return false;
    const r = targetRef.current.getBoundingClientRect();
    const pad = 14;
    return clientX > r.left - pad && clientX < r.right + pad && clientY > r.top - pad && clientY < r.bottom + pad;
  };

  const handlePointerDown = (e) => {
    dragInfo.current = { startX: e.clientX, startY: e.clientY, moved: false };
    setDragging(true);
    bubbleRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragInfo.current.startX;
    const dy = e.clientY - dragInfo.current.startY;
    if (!dragInfo.current.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
      dragInfo.current.moved = true;
      setShowTarget(true);
    }
    if (dragInfo.current.moved) {
      setDragPoint({ x: e.clientX, y: e.clientY });
      setOverTarget(isOverTarget(e.clientX, e.clientY));
    }
  };

  const dismiss = async () => {
    const now = new Date().toISOString();
    onDismiss?.(now);
    await supabase.from("profiles").update({ faq_bubble_dismissed_at: now }).eq("id", profile.id);
  };

  const handlePointerUp = (e) => {
    bubbleRef.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    setShowTarget(false);
    setOverTarget(false);
    if (dragInfo.current.moved) {
      if (isOverTarget(e.clientX, e.clientY)) dismiss();
      else savePos(nearestEdge(e.clientX, e.clientY));
    } else {
      setShowModal(true);
    }
    setDragPoint(null);
  };

  const bubbleStyle = dragging && dragPoint
    ? { left: dragPoint.x - BUBBLE_SIZE / 2, top: dragPoint.y - BUBBLE_SIZE / 2 }
    : dockStyle(pos);

  return (
    <>
      <button
        ref={bubbleRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Ayuda — arrástrame a un borde o a la x para cerrarme"
        style={{
          position: "fixed", zIndex: 50,
          width: BUBBLE_SIZE, height: BUBBLE_SIZE, borderRadius: "50%",
          background: C.ink, color: "#fff",
          boxShadow: SH.float,
          transition: dragging ? "none" : "left 0.2s ease, top 0.2s ease, right 0.2s ease, bottom 0.2s ease",
          touchAction: "none", cursor: dragging ? "grabbing" : "grab",
          ...bubbleStyle,
        }}
        className="flex items-center justify-center"
      >
        <HelpCircle size={20} />
      </button>

      {showTarget && (
        <div
          ref={targetRef}
          style={{
            position: "fixed", left: "50%", bottom: 110, transform: "translateX(-50%)",
            width: TARGET_SIZE, height: TARGET_SIZE, borderRadius: "50%", zIndex: 50,
            background: overTarget ? C.urgent : C.subtle,
            color: overTarget ? "#fff" : C.inkSoft,
            boxShadow: SH.float,
            transition: "background 0.1s, color 0.1s",
          }}
          className="flex items-center justify-center"
        >
          <X size={24} />
        </div>
      )}

      {showModal && <FaqModal onClose={() => setShowModal(false)} />}
    </>
  );
}
