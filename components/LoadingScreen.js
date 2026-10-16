import { C } from "@/lib/theme";

// Pantalla de carga compartida — el logo se dibuja rápido y luego late
// suave mientras los datos siguen llegando (ver animaciones en globals.css).
export default function LoadingScreen() {
  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex flex-col items-center justify-center gap-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-mark.svg" alt="" className="terregal-loading-logo" style={{ width: 120, height: "auto" }} />
      <p style={{ color: C.inkSoft }} className="text-sm">Cargando...</p>
    </div>
  );
}
