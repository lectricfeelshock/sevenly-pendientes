"use client";
import { useRef, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { C, SH } from "@/lib/theme";
import { shouldFloatFaqBubble } from "@/lib/faq";
import FaqModal from "./FaqModal";

const DRAG_THRESHOLD = 6; // px — menos que esto todavía cuenta como "clic", no arrastre

// CHANGES.md #8: burbuja flotante de ayuda — círculo negro con "?" pegado al
// borde derecho, que se puede arrastrar hacia la "x" para cerrarla. Si se
// cierra, deja de flotar hasta el próximo lunes (ver shouldFloatFaqBubble);
// mientras tanto, en el dashboard queda un ícono chico junto a la campana
// para seguir llegando al FAQ (eso vive en app/dashboard/page.js, no aquí).
export default function FaqBubble({ profile, onDismiss }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [showTarget, setShowTarget] = useState(false);
  const [overTarget, setOverTarget] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const bubbleRef = useRef(null);
  const targetRef = useRef(null);
  const dragInfo = useRef({ startX: 0, startY: 0, moved: false });

  if (!profile || !shouldFloatFaqBubble(profile.faq_bubble_dismissed_at)) return null;

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
      setOffset({ x: dx, y: dy });
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
    setOffset({ x: 0, y: 0 });
    if (dragInfo.current.moved) {
      if (isOverTarget(e.clientX, e.clientY)) dismiss();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        ref={bubbleRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        title="Ayuda — arrástrame a la x para cerrarme"
        style={{
          position: "fixed", right: 16, top: "58%", zIndex: 50,
          width: 48, height: 48, borderRadius: "50%",
          background: C.ink, color: "#fff",
          boxShadow: SH.float,
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: dragging ? "none" : "transform 0.2s ease",
          touchAction: "none", cursor: dragging ? "grabbing" : "grab",
        }}
        className="flex items-center justify-center"
      >
        <HelpCircle size={24} />
      </button>

      {showTarget && (
        <div
          ref={targetRef}
          style={{
            position: "fixed", left: "50%", bottom: 110, transform: "translateX(-50%)",
            width: 60, height: 60, borderRadius: "50%", zIndex: 50,
            background: overTarget ? C.urgent : C.subtle,
            color: overTarget ? "#fff" : C.inkSoft,
            boxShadow: SH.float,
            transition: "background 0.1s, color 0.1s",
          }}
          className="flex items-center justify-center"
        >
          <X size={26} />
        </div>
      )}

      {showModal && <FaqModal onClose={() => setShowModal(false)} />}
    </>
  );
}
