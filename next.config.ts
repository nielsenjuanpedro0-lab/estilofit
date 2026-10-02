import { randomUUID } from "node:crypto";
import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";

// Las dos pantallas del celular son estáticas y se precachean: así abren en modo avión.
// La revisión cambia en cada build para que un deploy nuevo reemplace las páginas guardadas.
const revision = randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // En @serwist/next 9.5 el plugin inyecta su propio registro en el bundle del cliente y crea
  // window.serwist antes que cualquier SerwistProvider, que entonces no registra nada. Por eso
  // registra el plugin y no hay provider en el layout.
  register: true,
  // Recargar al volver la señal tiraría una venta a medio cargar.
  reloadOnOnline: false,
  // Nada de guardar páginas al navegar: el panel es autenticado y no se cachea.
  cacheOnNavigation: false,
  // En desarrollo se pelea con el hot reload: el modo sin conexión se prueba con build de producción.
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/celular", revision },
    { url: "/vender", revision },
  ],
});

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hay un package-lock.json suelto en el home del usuario y Next lo toma como raíz del workspace.
  outputFileTracingRoot: import.meta.dirname,
};

export default withSerwist(nextConfig);
