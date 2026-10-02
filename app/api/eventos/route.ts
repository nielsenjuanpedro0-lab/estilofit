import { dispositivoDelPedido, respuestaOk } from "@/servidor/api-celular";
import { eventosParaCelular } from "@/servidor/paquete";

export async function GET(request: Request) {
  const dispositivo = await dispositivoDelPedido(request);
  if (dispositivo instanceof Response) return dispositivo;
  return respuestaOk({ eventos: await eventosParaCelular() });
}
