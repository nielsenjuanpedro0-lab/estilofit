import { z } from "zod";
import { canjearCodigo } from "@/servidor/dispositivos";

const SolicitudAlta = z.object({ codigo: z.string().trim().min(1).max(20) });

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "La solicitud no es JSON válido" }, { status: 400, headers: SIN_CACHE });
  }
  const solicitud = SolicitudAlta.safeParse(cuerpo);
  if (!solicitud.success) {
    return Response.json({ error: "Falta el código de alta" }, { status: 400, headers: SIN_CACHE });
  }

  const alta = await canjearCodigo(solicitud.data.codigo);
  if (!alta) {
    return Response.json(
      { error: "El código no existe, ya se usó o venció. Generá uno nuevo desde el panel, en Dispositivos." },
      { status: 401, headers: SIN_CACHE },
    );
  }
  return Response.json({ token: alta.token, dispositivo: alta.dispositivo }, { headers: SIN_CACHE });
}
