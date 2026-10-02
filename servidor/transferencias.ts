import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/conexion";
import { movimientos, productos, stockActual, variantes } from "@/db/esquema";

// El stock de una ubicación con nombre, talle y color, en el orden del catálogo.
export function stockConNombres(ubicacionId: number) {
  return db()
    .select({
      varianteId: variantes.id,
      producto: productos.nombre,
      marca: productos.marca,
      categoria: productos.categoria,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
      cantidad: stockActual.cantidad,
    })
    .from(stockActual)
    .innerJoin(variantes, eq(variantes.id, stockActual.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(stockActual.ubicacionId, ubicacionId))
    .orderBy(asc(productos.categoria), asc(productos.id), asc(variantes.id));
}

export type Faltante = { varianteId: number; pedido: number; disponible: number };
export type ResultadoTransferencia = { ok: true } | { ok: false; faltantes: Faltante[] };

// Acá no hay plata en juego y el panel tiene conexión: si falta stock en el origen se rechaza
// la transferencia entera y se corrige en el momento.
export async function transferir(datos: {
  origenId: number;
  destinoId: number;
  items: { varianteId: number; cantidad: number }[];
  nota?: string;
}): Promise<ResultadoTransferencia> {
  const { origenId, destinoId, items, nota } = datos;
  return db().transaction(async (tx) => {
    const ids = items.map((item) => item.varianteId);
    // FOR UPDATE: dos transferencias simultáneas desde el mismo origen no pueden validar las dos
    // contra el mismo número y dejarlo negativo.
    const stock = await tx
      .select({ varianteId: stockActual.varianteId, cantidad: stockActual.cantidad })
      .from(stockActual)
      .where(and(eq(stockActual.ubicacionId, origenId), inArray(stockActual.varianteId, ids)))
      .for("update");
    const disponible = new Map(stock.map((s) => [s.varianteId, s.cantidad]));

    const faltantes = items
      .map((item) => ({ varianteId: item.varianteId, pedido: item.cantidad, disponible: disponible.get(item.varianteId) ?? 0 }))
      .filter((f) => f.pedido > f.disponible);
    if (faltantes.length > 0) return { ok: false, faltantes };

    const ahora = new Date();
    await tx.insert(movimientos).values(
      items.map((item) => ({
        varianteId: item.varianteId,
        ubicacionOrigenId: origenId,
        ubicacionDestinoId: destinoId,
        cantidad: item.cantidad,
        tipo: "transferencia" as const,
        ocurridoAt: ahora,
        nota,
      })),
    );
    return { ok: true };
  });
}
