import { z } from "zod";
import { dispositivoDelPedido, respuestaDeError, respuestaOk } from "@/servidor/api-celular";
import { armarPaquete } from "@/servidor/paquete";

// El catálogo con precios no puede quedar abierto: sin token válido, 401.
export async function GET(request: Request) {
  const dispositivo = await dispositivoDelPedido(request);
  if (dispositivo instanceof Response) return dispositivo;

  const eventoId = z.coerce.number().int().positive().safeParse(new URL(request.url).searchParams.get("evento"));
  if (!eventoId.success) return respuestaDeError(400, "Falta el número de evento");
  const paquete = await armarPaquete(eventoId.data, dispositivo.id);
  if (!paquete) return respuestaDeError(404, "Ese evento no existe. Actualizá la lista de eventos.");
  return respuestaOk(paquete);
}
