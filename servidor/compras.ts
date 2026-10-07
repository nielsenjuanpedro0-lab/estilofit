import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, gte, ilike, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { compraItems, compras, movimientos, productos, proveedores, stockActual, ubicaciones, usuarios, variantes } from "@/db/esquema";
import { leerListado, parametro, POR_PAGINA, type ParametrosDeListado } from "@/servidor/listados";
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

// --- Lectura para el panel ---

const cargo = alias(usuarios, "cargo");
const anulo = alias(usuarios, "anulo");

// Validar que una fecha (YYYY-MM-DD) sea real, no solo que cumpla el formato.
function esUnaFechaValida(s: string): boolean {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function filtrosDeCompras(parametros: ParametrosDeListado) {
  const condiciones: SQL[] = [];
  const proveedor = Number(parametro(parametros, "proveedor"));
  if (Number.isInteger(proveedor) && proveedor > 0) condiciones.push(eq(compras.proveedorId, proveedor));
  const desde = parametro(parametros, "desde");
  if (desde && esUnaFechaValida(desde)) condiciones.push(gte(compras.fecha, desde));
  const hasta = parametro(parametros, "hasta");
  if (hasta && esUnaFechaValida(hasta)) condiciones.push(lte(compras.fecha, hasta));
  const estado = parametro(parametros, "estado");
  if (estado === "vigentes") condiciones.push(eq(compras.anulada, false));
  if (estado === "anuladas") condiciones.push(eq(compras.anulada, true));
  const q = parametro(parametros, "q")?.trim();
  if (q) {
    // Búsqueda numérica: solo si es un número dentro del rango seguro de int4 (1 a 2147483647),
    // para no chocar con "value out of range for type integer" en Postgres.
    const esNumeroSeguro = /^\d+$/.test(q) && Number(q) >= 1 && Number(q) <= 2147483647;
    const coincide = esNumeroSeguro ? or(eq(compras.id, Number(q)), ilike(compras.comprobante, `%${q}%`)) : ilike(compras.comprobante, `%${q}%`);
    if (coincide) condiciones.push(coincide);
  }
  return and(...condiciones);
}

// Columnas de la compra escritas a mano y calificadas: subselects correlacionados.
const unidadesDeCompra = sql`(select coalesce(sum(ci.cantidad), 0) from compra_items ci where ci.compra_id = "compras"."id")`.mapWith(Number);
const totalDeCompra = sql`(select coalesce(sum(ci.cantidad * ci.costo_unitario), 0) from compra_items ci where ci.compra_id = "compras"."id")`.mapWith(Number);

export async function listarCompras(parametros: ParametrosDeListado, todo = false) {
  const listado = leerListado(parametros, { fecha: compras.fecha, numero: compras.id }, "fecha");
  const donde = filtrosDeCompras(parametros);
  const consulta = db()
    .select({
      id: compras.id,
      fecha: compras.fecha,
      proveedorId: compras.proveedorId,
      proveedor: proveedores.nombre,
      comprobante: compras.comprobante,
      destino: ubicaciones.nombre,
      unidades: unidadesDeCompra,
      total: totalDeCompra,
      anulada: compras.anulada,
    })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .innerJoin(ubicaciones, eq(ubicaciones.id, compras.ubicacionId))
    .where(donde)
    .orderBy(listado.orden, sql`${compras.id} desc`);
  const filas = todo ? await consulta : await consulta.limit(POR_PAGINA).offset(listado.desplazamiento);
  const [conteo] = await db().select({ total: count() }).from(compras).where(donde);
  if (!conteo) throw new Error("count() no devolvió ninguna fila");
  return { filas, total: conteo.total, ...listado };
}

export async function detalleDeCompra(id: number) {
  const [fila] = await db()
    .select({ compra: compras, proveedor: proveedores.nombre, destino: ubicaciones.nombre, cargo: cargo.nombre, anulo: anulo.nombre })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .innerJoin(ubicaciones, eq(ubicaciones.id, compras.ubicacionId))
    .leftJoin(cargo, eq(cargo.id, compras.usuarioId))
    .leftJoin(anulo, eq(anulo.id, compras.anuladaPor))
    .where(eq(compras.id, id));
  if (!fila) return null;

  const renglones = await db()
    .select({
      varianteId: variantes.id,
      productoId: productos.id,
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
      cantidad: compraItems.cantidad,
      costoUnitario: compraItems.costoUnitario,
    })
    .from(compraItems)
    .innerJoin(variantes, eq(variantes.id, compraItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(compraItems.compraId, id))
    .orderBy(asc(productos.nombre), asc(variantes.id));

  const movs = await db()
    .select({
      id: movimientos.id,
      cantidad: movimientos.cantidad,
      entra: isNotNull(movimientos.ubicacionDestinoId).mapWith(Boolean),
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      ocurridoAt: movimientos.ocurridoAt,
    })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(eq(movimientos.tipo, "compra"), eq(movimientos.refId, id)))
    .orderBy(asc(movimientos.id));

  return { ...fila, renglones, movimientos: movs };
}
