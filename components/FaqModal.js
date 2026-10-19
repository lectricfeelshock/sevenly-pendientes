"use client";
import { useState } from "react";
import { X, ChevronDown, HelpCircle } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import { FAQ_ITEMS } from "@/lib/faq";

// CHANGES.md #8: ventana con las preguntas frecuentes de cómo usar la app
// — se abre desde la burbuja flotante o desde el ícono junto a la campana.
export default function FaqModal({ onClose }) {
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(27,30,36,0.45)" }} onClick={onClose}>
      <div
        style={{ background: C.panel, borderRadius: R.xxl, boxShadow: SH.card, maxHeight: "80vh" }}
        className="w-full max-w-md flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ borderColor: C.hairline }} className="border-b px-5 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle size={18} style={{ color: C.signal }} />
            <h2 style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 19 }}>Preguntas frecuentes</h2>
          </div>
          <button onClick={onClose} style={{ color: C.inkSoft }}><X size={18} /></button>
        </div>
        <div className="p-2 flex flex-col overflow-y-auto flex-1">
          {FAQ_ITEMS.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={i} style={{ borderColor: C.hairline }} className="border-b last:border-b-0">
                <button
                  onClick={() => setOpenIndex(open ? null : i)}
                  className="w-full flex items-center justify-between gap-3 px-3.5 py-3.5 text-left"
                >
                  <span style={{ color: C.ink, fontSize: 14.5, fontWeight: open ? 600 : 500 }}>{item.q}</span>
                  <ChevronDown size={16} style={{ color: C.inkSoft, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                </button>
                {open && (
                  <p className="px-3.5 pb-4 text-[13.5px] leading-relaxed" style={{ color: C.inkMedium }}>{item.a}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
