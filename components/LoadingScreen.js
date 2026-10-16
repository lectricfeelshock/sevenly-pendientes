import { C } from "@/lib/theme";

// Pantalla de carga compartida — el video trae el dibujado del logo
// exportado desde After Effects (fondo ya "horneado" en C.paper, sin
// canal alfa, para que se vea igual en todos los navegadores).
export default function LoadingScreen() {
  return (
    <div style={{ background: C.paper, minHeight: "100vh" }} className="w-full flex flex-col items-center justify-center gap-4">
      <video
        autoPlay loop muted playsInline
        width={160} height={61}
        style={{ width: 160, height: "auto" }}
      >
        <source src="/loading-logo.webm" type="video/webm" />
        <source src="/loading-logo.mp4" type="video/mp4" />
      </video>
      <p style={{ color: C.inkSoft }} className="text-sm">Cargando...</p>
    </div>
  );
}
