import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Estilofit",
  description: "Stock y venta en eventos",
  appleWebApp: { capable: true, title: "Estilofit", statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

// El service worker lo registra el plugin de Serwist (ver next.config.ts), no un provider acá.
export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
