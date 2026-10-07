import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/conexion";
import { compraItems, compras, movimientos, proveedores, stockActual, ubicaciones, variantes } from "@/db/esquema";
import type { Faltante } from "@/servidor/transferencias";

// Mercadería que entra de un proveedor. Todo en una transacción: cabecera, renglones, movimientos
// y el costo nuevo de cada variante. El costo es el de la última compra.

// El día de hoy en Argentina, como "2026-10-07": una compra no puede tener fecha futura.
export function hoyArgentino() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

export type RenglonDeCompra = { varianteId: number; cantidad: number; costoUnitario: number };
export type DatosDeCompra = {
  clientUuid: string;
  proveedorId: number;
  ubicacionId: number;
  fecha: string;
  comprobante: string | null;
  nota: string | null;
  items: RenglonDeCompra[];
  usuarioId: number | null;
};
export type ResultadoCompra = { ok: true; compraId: number; repetida: boolean } | { ok: false; motivo: string };

export async function registrarCompra(d: DatosDeCompra): Promise<ResultadoCompra> {
  if (d.items.length === 0) return { ok: false, motivo: "Agregá al menos un producto a la compra" };
  const ids = d.items.map((i) => i.varianteId);
  if (new Set(ids).size !== ids.length) return { ok: false, motivo: "Hay un producto repetido: sumá la cantidad en un solo renglón" };
  if (d.fecha > hoyArgentino()) return { ok: false, motivo: "La fecha de la compra no puede ser futura" };

  return db().transaction(async (tx) => {
    // Si ya entró (doble clic, reintento), se devuelve la misma sin volver a validar.
    const [existente] = await tx.select({ id: compras.id }).from(compras).where(eq(compras.clientUuid, d.clientUuid));
    if (existente) return { ok: true, compraId: existente.id, repetida: true };

    const [proveedor] = await tx.select().from(proveedores).where(eq(proveedores.id, d.proveedorId));
    if (!proveedor) return { ok: false, motivo: "El proveedor no existe. Recargá la página." };
    if (!proveedor.activo) return { ok: false, motivo: `${proveedor.nombre} está desactivado. Reactivalo en Proveedores.` };

    const [destino] = await tx.select().from(ubicaciones).where(eq(ubicaciones.id, d.ubicacionId));
    if (!destino || !destino.activa || (destino.tipo !== "deposito" && destino.tipo !== "showroom")) {
      return { ok: false, motivo: "La mercadería entra a un depósito o showroom activo. A un evento se lleva con una transferencia." };
    }

    const encontradas = await tx.select({ id: variantes.id, activo: variantes.activo }).from(variantes).where(inArray(variantes.id, ids));
    const activas = new Set(encontradas.filter((v) => v.activo).map((v) => v.id));
    const faltan = ids.filter((id) => !activas.has(id));
    if (faltan.length > 0) return { ok: false, motivo: `Hay variantes que no existen o están desactivadas (${faltan.join(", ")}). Revisalas en Catálogo.` };

    const [nueva] = await tx
      .insert(compras)
      .values({
        clientUuid: d.clientUuid,
        proveedorId: d.proveedorId,
        ubicacionId: d.ubicacionId,
        fecha: d.fecha,
        comprobante: d.comprobante,
        nota: d.nota,
        usuarioId: d.usuarioId,
      })
      // Otro pedido con la misma compra pudo entrar entre el SELECT y este INSERT.
      .onConflictDoNothing({ target: compras.clientUuid })
      .returning({ id: compras.id });
    if (!nueva) {
      const [ganadora] = await tx.select({ id: compras.id }).from(compras).where(eq(compras.clientUuid, d.clientUuid));
      if (!ganadora) throw new Error("La compra chocó por client_uuid pero no aparece");
      return { ok: true, compraId: ganadora.id, repetida: true };
    }

    await tx.insert(compraItems).values(d.items.map((i) => ({ compraId: nueva.id, ...i })));
    const ahora = new Date();
    await tx.insert(movimientos).values(
      d.items.map((i) => ({
        varianteId: i.varianteId,
        ubicacionDestinoId: d.ubicacionId,
        cantidad: i.cantidad,
        tipo: "compra" as const,
        refId: nueva.id,
        ocurridoAt: ahora,
        usuarioId: d.usuarioId,
        nota: d.comprobante ? `${proveedor.nombre} · ${d.comprobante}` : proveedor.nombre,
      })),
    );
    for (const i of d.items) await tx.update(variantes).set({ costo: i.costoUnitario }).where(eq(variantes.id, i.varianteId));
    return { ok: true, compraId: nueva.id, repetida: false };
  });
}

// Anular es sacar del destino lo que entró. Si ya se movió o se vendió, no se anula nada: igual que
// una transferencia, se rechaza entera y se dice qué falta. El costo de las variantes no vuelve atrás.
export async function anularCompra(compraId: number, usuarioId: number | null, motivo: string) {
  return db().transaction(async (tx): Promise<{ ok: true } | { ok: false; motivo: string; faltantes: Faltante[] }> => {
    const [compra] = await tx.select().from(compras).where(eq(compras.id, compraId)).for("update");
    if (!compra) return { ok: false, motivo: "La compra no existe", faltantes: [] };
    if (compra.anulada) return { ok: false, motivo: "La compra ya está anulada", faltantes: [] };

    const items = await tx.select().from(compraItems).where(eq(compraItems.compraId, compraId));
    const stock = await tx
      .select({ varianteId: stockActual.varianteId, cantidad: stockActual.cantidad })
      .from(stockActual)
      .where(and(eq(stockActual.ubicacionId, compra.ubicacionId), inArray(stockActual.varianteId, items.map((i) => i.varianteId))))
      .for("update");
    const hay = new Map(stock.map((s) => [s.varianteId, s.cantidad]));
    const faltantes = items
      .map((i) => ({ varianteId: i.varianteId, pedido: i.cantidad, disponible: Math.max(0, hay.get(i.varianteId) ?? 0) }))
      .filter((f) => f.pedido > f.disponible);
    if (faltantes.length > 0) return { ok: false, motivo: "Parte de lo que entró ya no está en el destino", faltantes };

    const ahora = new Date();
    await tx.insert(movimientos).values(
      items.map((i) => ({
        varianteId: i.varianteId,
        ubicacionOrigenId: compra.ubicacionId,
        cantidad: i.cantidad,
        tipo: "compra" as const,
        refId: compra.id,
        ocurridoAt: ahora,
        usuarioId,
        nota: `Anulación de la compra #${compra.id}: ${motivo}`,
      })),
    );
    await tx.update(compras).set({ anulada: true, anuladaAt: ahora, anuladaPor: usuarioId, motivoAnulacion: motivo }).where(eq(compras.id, compra.id));
    return { ok: true };
  });
}
