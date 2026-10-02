import { almacen, type VentaLocal } from "@/celular/almacen";
import { mensajeDeError, pedir } from "@/celular/api";
import { MAXIMO_VENTAS_POR_LOTE, RespuestaSincronizacion, type LoteDeVentas } from "@/contrato/sincronizacion";

// La cola de ventas del celular. Regla que no se negocia: una venta no deja de estar pendiente
// hasta que el servidor responde confirmando su client_uuid. Aunque el POST parezca haber salido:
// la respuesta se puede perder de vuelta, y reenviar es seguro porque el servidor es idempotente.

const ESPERA_BASE_MS = 2_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

// Backoff exponencial con jitter completo: si diez celulares recuperan señal a la vez,
// no vuelven a golpear al servidor todos en el mismo segundo.
export function proximoIntento(intentos: number, ahora: number, azar: () => number = Math.random) {
  const techo = Math.min(ESPERA_MAXIMA_MS, ESPERA_BASE_MS * 2 ** intentos);
  return ahora + Math.round(azar() * techo);
}

export type ResultadoCola = "sin-alta" | "revocado" | "nada-para-subir" | "al-dia" | "sin-senal" | "servidor-con-problemas";

type Opciones = {
  // Reenvía todas las ventas del celular, también las ya confirmadas. Demuestra la idempotencia.
  todas?: boolean;
  // Volvió la señal o lo pidió la persona: no esperar el backoff.
  sinEsperar?: boolean;
};

let enCurso: Promise<ResultadoCola> | null = null;

// Una sola corrida a la vez: el botón, el evento "online" y el reloj pueden pedirla juntos.
export function sincronizar(opciones: Opciones = {}): Promise<ResultadoCola> {
  enCurso ??= subir(opciones).finally(() => {
    enCurso = null;
  });
  return enCurso;
}

async function postergar(lote: VentaLocal[]) {
  const ahora = Date.now();
  await almacen.transaction("rw", almacen.ventas, async () => {
    for (const venta of lote) {
      if (venta.estado !== "pendiente") continue;
      await almacen.ventas.update(venta.clientUuid, { intentos: venta.intentos + 1, proximoIntentoEn: proximoIntento(venta.intentos + 1, ahora) });
    }
  });
}

async function subir({ todas = false, sinEsperar = false }: Opciones): Promise<ResultadoCola> {
  const sesion = await almacen.sesion.get(1);
  if (!sesion) return "sin-alta";
  if (sesion.revocado) return "revocado";

  const ahora = Date.now();
  const candidatas = (await almacen.ventas.orderBy("creadaEn").toArray()).filter(
    (v) => todas || (v.estado === "pendiente" && (sinEsperar || v.proximoIntentoEn <= ahora)),
  );
  if (candidatas.length === 0) return "nada-para-subir";
  const eventoActivo = (await almacen.eventos.toArray()).sort((a, b) => b.descargadoEn - a.descargadoEn)[0];

  for (let desde = 0; desde < candidatas.length; desde += MAXIMO_VENTAS_POR_LOTE) {
    const lote = candidatas.slice(desde, desde + MAXIMO_VENTAS_POR_LOTE);
    const pendientes = await almacen.ventas.where("estado").equals("pendiente").count();
    const cuerpo: LoteDeVentas = {
      ventas: lote.map((v) => ({
        clientUuid: v.clientUuid,
        eventoId: v.eventoId,
        vendidoAt: v.vendidoAt,
        medioPago: v.medioPago,
        total: v.total,
        items: v.items.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
      })),
      pendientesFueraDelLote: Math.max(0, pendientes - lote.filter((v) => v.estado === "pendiente").length),
      eventoId: eventoActivo?.id ?? null,
    };

    const pedido = await pedir("/api/sincronizar", sesion.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    if (pedido.tipo === "sin-senal") {
      await postergar(lote);
      return "sin-senal";
    }
    const { respuesta } = pedido;
    if (respuesta.status === 401) {
      await almacen.sesion.update(1, { revocado: true });
      return "revocado";
    }
    if (respuesta.status === 429 || respuesta.status >= 500) {
      await postergar(lote);
      return "servidor-con-problemas";
    }
    if (!respuesta.ok) {
      // 4xx: el lote está roto. Reintentarlo no lo arregla y el bucle taparía el contador.
      const motivo = await mensajeDeError(respuesta);
      await almacen.transaction("rw", almacen.ventas, async () => {
        for (const v of lote) if (v.estado === "pendiente") await almacen.ventas.update(v.clientUuid, { estado: "rechazada", motivoRechazo: motivo });
      });
      continue;
    }

    // Una respuesta cortada a mitad de camino no confirma nada: las ventas siguen pendientes.
    const leida = RespuestaSincronizacion.safeParse(await respuesta.json().catch(() => null));
    if (!leida.success) {
      await postergar(lote);
      return "servidor-con-problemas";
    }
    const { confirmadas, rechazadas, otrosDispositivos } = leida.data;
    const confirmadasEn = Date.now();
    const motivos = new Map(rechazadas.map((r) => [r.clientUuid, r.motivo]));
    await almacen.transaction("rw", almacen.ventas, almacen.eventos, async () => {
      for (const v of lote) {
        if (confirmadas.includes(v.clientUuid)) {
          // Se conserva la primera confirmación: el stock del celular depende de esa fecha.
          await almacen.ventas.update(v.clientUuid, { estado: "confirmada", motivoRechazo: null, confirmadaEn: v.confirmadaEn ?? confirmadasEn });
        } else if (motivos.has(v.clientUuid)) {
          await almacen.ventas.update(v.clientUuid, { estado: "rechazada", motivoRechazo: motivos.get(v.clientUuid) ?? null });
        }
      }
      if (eventoActivo && otrosDispositivos !== null) await almacen.eventos.update(eventoActivo.id, { otrosDispositivos });
    });
    const sinRespuesta = lote.filter((v) => !confirmadas.includes(v.clientUuid) && !motivos.has(v.clientUuid));
    if (sinRespuesta.length > 0) await postergar(sinRespuesta);
  }
  return "al-dia";
}
