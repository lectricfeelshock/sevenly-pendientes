"use client";
import { useRouter } from "next/navigation";
import { ClipboardList, BookOpen, Users, User, ChevronRight } from "lucide-react";
import { C, R, SH, FONT_SERIF } from "@/lib/theme";

// Navegación compartida: barra inferior en móvil, barra lateral en escritorio
// (md+). `active` es una de "tareas" | "biblioteca" | "equipo" | "perfil".
// `profile` es opcional — si se pasa {name, email}, se usa para la tarjeta de
// identidad del sidebar de escritorio. `onEquipo`, si se pasa (solo lo hace
// el propio dashboard), abre el panel de Equipo ahí mismo en vez de navegar
// — Equipo no tiene ruta propia todavía, vive como panel del dashboard.
export default function BottomNav({ active, profile, onEquipo }) {
  const router = useRouter();
  const items = [
    { key: "tareas", label: "Tareas", icon: ClipboardList, href: "/dashboard" },
    { key: "biblioteca", label: "Biblioteca", icon: BookOpen, href: "/biblioteca" },
    { key: "equipo", label: "Equipo", icon: Users, href: "/dashboard" },
    { key: "perfil", label: "Perfil", icon: User, href: "/perfil" },
  ];
  const initial = (profile?.name || "?").trim().charAt(0).toUpperCase();
  const go = (item) => { if (item.key === "equipo" && onEquipo) onEquipo(); else router.push(item.href); };

  return (
    <>
      {/* Móvil: barra inferior */}
      <div
        style={{ background: C.panel, boxShadow: SH.nav }}
        className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex items-start gap-1 px-2 pt-3 pb-[max(10px,env(safe-area-inset-bottom))]"
      >
        {items.map((item) => {
          const { key, label, icon: Icon } = item;
          const isActive = key === active;
          return (
            <button
              key={key}
              onClick={() => go(item)}
              className="flex-1 flex flex-col items-center gap-1.5"
              style={{ color: isActive ? C.ink : C.gray }}
            >
              <Icon size={22} strokeWidth={isActive ? 1.9 : 1.75} />
              <span style={{ fontSize: 10.5, fontWeight: isActive ? 700 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Escritorio: barra lateral */}
      <aside
        style={{ width: 248, background: C.panel, boxShadow: "inset -1px 0 0 #ECE7DD" }}
        className="hidden md:flex fixed left-0 top-0 bottom-0 z-30 flex-col p-4"
      >
        <button onClick={() => router.push("/dashboard")} className="flex items-center gap-[11px] px-1.5">
          <div style={{ width: 34, height: 34, borderRadius: 11, background: C.ink, color: C.paper, fontFamily: FONT_SERIF, fontSize: 18, fontWeight: 500 }} className="flex items-center justify-center">T</div>
          <span style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em" }}>Terregal</span>
        </button>

        <div className="flex flex-col gap-1 mt-6">
          {items.filter((i) => i.key !== "perfil").map((item) => {
            const { key, label, icon: Icon } = item;
            const isActive = key === active;
            return (
              <button
                key={key}
                onClick={() => go(item)}
                style={{ height: 44, borderRadius: 12, background: isActive ? C.subtle : "transparent", color: isActive ? C.ink : "#6F747E", fontWeight: isActive ? 600 : 500 }}
                className="flex items-center gap-[11px] px-3 text-[14.5px]"
              >
                <Icon size={20} strokeWidth={isActive ? 1.9 : 1.75} /> {label}
              </button>
            );
          })}
        </div>

        <div className="flex-grow" />

        <button
          onClick={() => router.push("/perfil")}
          style={{ boxShadow: "inset 0 1px 0 #F1EDE5" }}
          className="flex items-center gap-[11px] px-2 py-2.5 rounded-[14px] mb-1"
        >
          <div style={{ width: 36, height: 36, borderRadius: R.pill, background: C.ink, color: C.paper, fontSize: 14, fontWeight: 700 }} className="flex items-center justify-center flex-shrink-0">{initial}</div>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5 text-left">
            <span style={{ fontSize: 14, fontWeight: 600 }}>{profile?.name || "..."}</span>
            <span style={{ fontSize: 11.5, color: C.gray }} className="truncate block">{profile?.email || ""}</span>
          </div>
          <ChevronRight size={17} style={{ color: "#C3C0B8" }} className="flex-shrink-0" />
        </button>
      </aside>
    </>
  );
}
