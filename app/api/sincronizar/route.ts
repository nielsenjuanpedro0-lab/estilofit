import { LoteDeVentas, type RespuestaSincronizacion } from "@/contrato/sincronizacion";
import { dispositivoDelPedido, respuestaDeError, respuestaOk } from "@/servidor/api-celular";
import { dentroDelLimite } from "@/servidor/limite-velocidad";
import { informarPendientes, otrosDispositivosEn } from "@/servidor/paquete";
import { registrarLote } from "@/servidor/sincronizacion";

export async function POST(request: Request) {
  const dispositivo = await dispositivoDelPedido(request);
  if (dispositivo instanceof Response) return dispositivo;
  if (!dentroDelLimite(dispositivo.id)) {
    return respuestaDeError(429, "Demasiados pedidos seguidos. Se reintenta solo en un minuto.", { "Retry-After": "60" });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return respuestaDeError(400, "La solicitud no es JSON válido");
  }
  const lote = LoteDeVentas.safeParse(cuerpo);
  if (!lote.success) return respuestaDeError(400, "El lote de ventas no tiene el formato esperado");

  const resultado = await registrarLote(dispositivo.id, lote.data.ventas);
  await informarPendientes(dispositivo.id, lote.data.pendientesFueraDelLote);
  const respuesta: RespuestaSincronizacion = {
    ...resultado,
    otrosDispositivos: lote.data.eventoId === null ? null : await otrosDispositivosEn(lote.data.eventoId, dispositivo.id),
  };
  return respuestaOk(respuesta);
}
