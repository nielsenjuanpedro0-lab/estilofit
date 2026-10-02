import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // /vender?evento=3 se sirve con la misma página precacheada que /vender.
  precacheOptions: { ignoreURLParametersMatching: [/^evento$/] },
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  // Nada autenticado ni ninguna ruta de API se cachea. Sin red, el pedido tiene que fallar
  // de verdad: así la cola de ventas lo reintenta después en vez de creer que salió.
  runtimeCaching: [
    { matcher: ({ url }) => url.pathname.startsWith("/api/"), handler: new NetworkOnly() },
    { matcher: ({ url }) => url.pathname.startsWith("/panel") || url.pathname.startsWith("/ingresar"), handler: new NetworkOnly() },
  ],
});

serwist.addEventListeners();
