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
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Sevenly" />
      </head>
      <body>{children}</body>
    </html>
  );
}
