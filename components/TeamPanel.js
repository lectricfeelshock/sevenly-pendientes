"use client";
import { useState } from "react";
import { Users, X, ChevronDown } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

// Panel compartido "Mi equipo" — lo abren Pendientes, Biblioteca y Perfil
// (vía el botón "Equipo" de BottomNav), no solo Pendientes.
export default function TeamPanel({ onClose, profiles, tasks }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ background: "rgba(27,30,36,0.5)" }} onClick={onClose}>
      <div style={{ background: C.paper, borderTopLeftRadius: 28, borderBottomLeftRadius: 28 }} className="w-full max-w-sm h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div style={{ background: C.paper, boxShadow: `inset 0 -1px 0 ${C.hairline}` }} className="px-5 py-4 sticky top-0 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2" style={{ color: C.ink, fontFamily: FONT_SERIF, fontSize: 23, fontWeight: 500 }}><Users size={19} /> Equipo</div>
          <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: R.pill, background: C.subtle, color: C.inkMedium }} className="flex items-center justify-center"><X size={17} /></button>
        </div>
        <div className="p-4 flex flex-col gap-2.5">
          {profiles.map((p) => {
            const inProgress = tasks.filter((t) => t.assigned_to_id === p.id && t.status === "En progreso");
            const open = picked === p.id;
            const initial = (p.name || "?").trim().charAt(0).toUpperCase();
            return (
              <div key={p.id} style={{ background: C.panel, borderRadius: R.xl, boxShadow: SH.card }} className="overflow-hidden">
                <button onClick={() => setPicked(open ? null : p.id)} className="w-full text-left flex items-center gap-3 px-4 py-3.5">
                  <div style={{ width: 40, height: 40, borderRadius: R.pill, background: inProgress.length > 0 ? C.ink : C.subtle, color: inProgress.length > 0 ? C.paper : "#6F747E" }} className="flex items-center justify-center flex-shrink-0 text-[14px] font-bold">{initial}</div>
                  <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15.5px] font-semibold">{p.name}</span>
                    <span className="text-[12.5px]" style={{ color: inProgress.length > 0 ? C.inkSoft : C.inkFaint }}>{inProgress.length > 0 ? `${inProgress.length} en progreso` : "Nada en progreso"}</span>
                  </div>
                  <ChevronDown size={18} style={{ color: C.gray, transform: open ? "rotate(180deg)" : "none", flexShrink: 0 }} />
                </button>
                {open && inProgress.length > 0 && (
                  <div className="px-4 pb-4 flex flex-col gap-2">
                    {inProgress.map((t) => (
                      <div key={t.id} style={{ background: C.paper, borderRadius: R.md }} className="px-3.5 py-2.5 flex items-center gap-2.5">
                        <span style={{ width: 8, height: 8, borderRadius: R.pill, background: C.signal, flexShrink: 0 }} />
                        <div className="min-w-0 flex flex-col gap-0.5">
                          <span className="text-[14px] font-semibold truncate block">{t.title}</span>
                          <span className="text-[12px]" style={{ color: C.inkSoft }}>{t.category} · vence {fmtDate(t.deadline)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
