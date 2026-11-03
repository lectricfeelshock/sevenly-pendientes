import "./globals.css";

export const metadata = {
  title: "Terregal · Panel de pendientes",
  description: "Control de pendientes del equipo Terregal",
  manifest: "/manifest.json",
};

// viewportFit "cover": sin esto el iPhone (app instalada en el inicio)
// reporta env(safe-area-inset-bottom) en 0 y la barrita de inicio queda
// encima del menú de abajo. maximumScale 1 evita que se haga zoom (incluido
// el zoom automático de iOS al escribir en un campo) y se desacomode.
export const viewport = {
  themeColor: "#14181F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        {/* "default": la app empieza debajo de la hora y la batería (con
            "black-translucent" el contenido se metía debajo y la hora salía
            en blanco sobre el fondo claro). */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Terregal" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
