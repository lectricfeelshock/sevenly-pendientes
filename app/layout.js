import "./globals.css";

export const metadata = {
  title: "Sevenly · Panel de pendientes",
  description: "Control de pendientes del equipo Sevenly",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#14181F",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
