import { autenticarDispositivo } from "@/servidor/dispositivos";

// Lo común a los endpoints que usa el celular. Nada de esto se cachea: ni en el navegador,
// ni en un proxy, ni en el service worker (que además usa NetworkOnly para /api).

export const SIN_CACHE = { "Cache-Control": "no-store" };

export function respuestaDeError(status: number, error: string, encabezados: Record<string, string> = {}) {
  return Response.json({ error }, { status, headers: { ...SIN_CACHE, ...encabezados } });
}

export function respuestaOk(cuerpo: unknown) {
  return Response.json(cuerpo, { headers: SIN_CACHE });
}

// Devuelve el dispositivo, o la respuesta 401 lista para devolver.
export async function dispositivoDelPedido(request: Request) {
  const dispositivo = await autenticarDispositivo(request.headers.get("authorization"));
  if (dispositivo) return dispositivo;
  return respuestaDeError(401, "Este celular no está dado de alta o fue revocado. Pedí un código nuevo en el panel, en Dispositivos.");
}
