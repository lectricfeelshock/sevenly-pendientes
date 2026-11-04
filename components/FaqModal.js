"use client";
import { useState } from "react";
import { X, ChevronDown, HelpCircle, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";
import { FAQ_ITEMS } from "@/lib/faq";

// CHANGES.md #8: ventana con las preguntas frecuentes de cómo usar la app
// — se abre desde la burbuja flotante o desde el ícono junto a la campana.
// CHANGES.md #29: si se pasa `profile`, al final de la lista se puede
// mandar una duda propia — llega a `faq_submissions`, visible solo para el
// admin en la sección "FAQ" del menú (app/faq/page.js).
export default function FaqModal({ onClose, profile }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submitQuestion = async () => {
    if (!question.trim() || !profile?.id || sending) return;
    setSending(true);
    await supabase.from("faq_submissions").insert({ user_id: profile.id, user_name: profile.name, question: question.trim() });
    setSending(false);
    setQuestion("");
    setSent(true);
    setTimeout(() => setSent(false), 4000);
  };

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
          {profile?.id && (
            <div className="px-3.5 pt-4 pb-3 mt-1" style={{ borderTop: `1px solid ${C.hairline}` }}>
              <p className="text-[13px] font-semibold mb-1.5" style={{ color: C.ink }}>¿Tienes otra duda?</p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Escríbela aquí..."
                rows={2}
                style={{ background: C.paper, borderRadius: R.md }}
                className="w-full px-3 py-2.5 text-sm outline-none resize-none"
              />
              <div className="flex items-center justify-between mt-2 gap-2">
                <span className="text-[12px]" style={{ color: C.signal }}>{sent ? "¡Gracias, la revisamos pronto!" : ""}</span>
                <button
                  onClick={submitQuestion}
                  disabled={!question.trim() || sending}
                  style={{ background: C.ink, color: C.paper, borderRadius: R.pill, opacity: !question.trim() || sending ? 0.5 : 1 }}
                  className="px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 flex-shrink-0 disabled:cursor-not-allowed"
                >
                  <Send size={13} /> {sending ? "Enviando..." : "Enviar"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
