import { LoteDeVentas } from "@/contrato/sincronizacion";
import { autenticarDispositivo } from "@/servidor/dispositivos";
import { dentroDelLimite } from "@/servidor/limite-velocidad";
import { registrarLote } from "@/servidor/sincronizacion";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const dispositivo = await autenticarDispositivo(request.headers.get("authorization"));
  if (!dispositivo) {
    return Response.json(
      { error: "Este dispositivo no está dado de alta o fue revocado. Pedí un código nuevo en el panel." },
      { status: 401, headers: SIN_CACHE },
    );
  }
  if (!dentroDelLimite(dispositivo.id)) {
    return Response.json({ error: "Demasiados pedidos seguidos. Se reintenta solo en un minuto." }, { status: 429, headers: { ...SIN_CACHE, "Retry-After": "60" } });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return Response.json({ error: "La solicitud no es JSON válido" }, { status: 400, headers: SIN_CACHE });
  }
  const lote = LoteDeVentas.safeParse(cuerpo);
  if (!lote.success) {
    return Response.json({ error: "El lote de ventas no tiene el formato esperado" }, { status: 400, headers: SIN_CACHE });
  }

  return Response.json(await registrarLote(dispositivo.id, lote.data.ventas), { headers: SIN_CACHE });
}
