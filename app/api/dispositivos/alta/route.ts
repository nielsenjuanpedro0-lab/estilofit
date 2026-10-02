import { z } from "zod";
import { respuestaDeError, respuestaOk } from "@/servidor/api-celular";
import { canjearCodigo } from "@/servidor/dispositivos";

const SolicitudAlta = z.object({ codigo: z.string().trim().min(1).max(20) });

export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return respuestaDeError(400, "La solicitud no es JSON válido");
  }
  const solicitud = SolicitudAlta.safeParse(cuerpo);
  if (!solicitud.success) return respuestaDeError(400, "Falta el código de alta");

  const alta = await canjearCodigo(solicitud.data.codigo);
  if (!alta) return respuestaDeError(401, "El código no existe, ya se usó o venció. Generá uno nuevo desde el panel, en Dispositivos.");
  return respuestaOk({ token: alta.token, dispositivo: alta.dispositivo });
}
