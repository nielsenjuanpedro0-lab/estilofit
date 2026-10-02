import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/conexion";
import { eventos, movimientos, variantes, ventaItems, ventas } from "@/db/esquema";
import { VentaDelDispositivo, type RespuestaSincronizacion } from "@/contrato/sincronizacion";

// La regla detrás de todo este archivo: cuando hay plata cobrada en juego, el servidor acepta
// y deja rastro (para_revisar); solo rechaza lo que es un payload roto, que reintentar no arregla.

function topeRedondeoEnCentavos() {
  const pesos = Number(process.env.TOPE_REDONDEO_EFECTIVO ?? "1000");
  if (!Number.isFinite(pesos) || pesos < 0) throw new Error("TOPE_REDONDEO_EFECTIVO tiene que ser una cantidad de pesos");
  return Math.round(pesos * 100);
}

// La plata se suma en centavos enteros: sumar decimales en float acumula error.
const aCentavos = (pesos: number) => Math.round(pesos * 100);

// UUID v5 (RFC 9562) derivado del UUID de la venta y el número de renglón: el mismo renglón
// da siempre el mismo UUID, así el movimiento también tiene clave idempotente propia.
export function uuidDeRenglon(ventaUuid: string, renglon: number) {
  const hash = createHash("sha1")
    .update(Buffer.from(ventaUuid.replace(/-/g, ""), "hex"))
    .update(`renglon:${renglon}`)
    .digest()
    .subarray(0, 16);
  hash.writeUInt8((hash.readUInt8(6) & 0x0f) | 0x50, 6);
  hash.writeUInt8((hash.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = hash.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

type Resultado = { ok: true } | { ok: false; motivo: string };

async function registrarVenta(dispositivoId: number, venta: VentaDelDispositivo): Promise<Resultado> {
  return db().transaction(async (tx) => {
    // Si ya está, se confirma sin volver a validar: pudo entrar ayer con un catálogo que hoy cambió.
    const [existente] = await tx.select({ id: ventas.id }).from(ventas).where(eq(ventas.clientUuid, venta.clientUuid));
    if (existente) return { ok: true };

    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, venta.eventoId));
    if (!evento) return { ok: false, motivo: `El evento ${venta.eventoId} no existe` };

    const ids = [...new Set(venta.items.map((item) => item.varianteId))];
    const catalogo = await tx.select({ id: variantes.id, precio: variantes.precio }).from(variantes).where(inArray(variantes.id, ids));
    const precios = new Map(catalogo.map((v) => [v.id, v.precio]));
    const inexistentes = ids.filter((id) => !precios.has(id));
    if (inexistentes.length > 0) return { ok: false, motivo: `Variantes que no existen en el catálogo: ${inexistentes.join(", ")}` };

    const renglones = venta.items.map((item) => {
      const precio = precios.get(item.varianteId);
      if (precio === undefined) throw new Error(`Precio faltante para la variante ${item.varianteId}`);
      return { ...item, precioUnitario: precio };
    });
    const totalCatalogo = renglones.reduce((suma, r) => suma + aCentavos(r.precioUnitario) * r.cantidad, 0);

    const motivos: string[] = [];
    if (evento.estado === "cerrado") motivos.push("Llegó con el evento ya cerrado");
    // Cobrar un poco menos en efectivo es redondeo. Cualquier otra diferencia se acepta pero se revisa.
    const diferencia = totalCatalogo - aCentavos(venta.total);
    const esRedondeo = venta.medioPago === "efectivo" && diferencia > 0 && diferencia <= topeRedondeoEnCentavos();
    if (diferencia !== 0 && !esRedondeo) {
      motivos.push(`El dispositivo cobró $${venta.total} y el catálogo da $${totalCatalogo / 100}`);
    }

    const [nueva] = await tx
      .insert(ventas)
      .values({
        clientUuid: venta.clientUuid,
        eventoId: evento.id,
        ubicacionId: evento.ubicacionId,
        total: venta.total,
        totalCatalogo: totalCatalogo / 100,
        medioPago: venta.medioPago,
        deviceId: dispositivoId,
        vendidoAt: new Date(venta.vendidoAt),
        paraRevisar: motivos.length > 0,
        motivoRevision: motivos.length > 0 ? motivos.join(". ") : null,
      })
      // Otra request con la misma venta pudo entrar entre el SELECT y este INSERT.
      .onConflictDoNothing({ target: ventas.clientUuid })
      .returning({ id: ventas.id });
    if (!nueva) return { ok: true };

    await tx.insert(ventaItems).values(
      renglones.map((r) => ({ ventaId: nueva.id, varianteId: r.varianteId, cantidad: r.cantidad, precioUnitario: r.precioUnitario })),
    );
    // Sin chequeo de stock: la plata ya se cobró. Si queda negativo, se resuelve en el cierre.
    await tx
      .insert(movimientos)
      .values(
        renglones.map((r, i) => ({
          varianteId: r.varianteId,
          ubicacionOrigenId: evento.ubicacionId,
          cantidad: r.cantidad,
          tipo: "venta" as const,
          refId: nueva.id,
          clientUuid: uuidDeRenglon(venta.clientUuid, i),
          deviceId: dispositivoId,
          ocurridoAt: new Date(venta.vendidoAt),
        })),
      )
      .onConflictDoNothing({ target: movimientos.clientUuid });
    return { ok: true };
  });
}

function uuidDeLoQueVino(cruda: unknown) {
  if (typeof cruda === "object" && cruda !== null && "clientUuid" in cruda && typeof cruda.clientUuid === "string") {
    return cruda.clientUuid;
  }
  return "";
}

export async function registrarLote(dispositivoId: number, ventasCrudas: unknown[]) {
  const respuesta: Pick<RespuestaSincronizacion, "confirmadas" | "rechazadas"> = { confirmadas: [], rechazadas: [] };
  for (const cruda of ventasCrudas) {
    const venta = VentaDelDispositivo.safeParse(cruda);
    if (!venta.success) {
      respuesta.rechazadas.push({ clientUuid: uuidDeLoQueVino(cruda), motivo: `Datos inválidos: ${z.prettifyError(venta.error)}` });
      continue;
    }
    const resultado = await registrarVenta(dispositivoId, venta.data);
    if (resultado.ok) respuesta.confirmadas.push(venta.data.clientUuid);
    else respuesta.rechazadas.push({ clientUuid: venta.data.clientUuid, motivo: resultado.motivo });
  }
  return respuesta;
}
