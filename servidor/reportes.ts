import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, productos, stockActual, ubicaciones, usuarios, variantes, ventaItems, ventas } from "@/db/esquema";

// El período se aplica sobre la fecha del evento y no sobre la hora de la venta: el reloj del
// celular puede estar corrido y recibido_at cae el lunes si la venta subió tarde. En Fase 1 toda
// venta es de un evento, así que la fecha del evento es la referencia confiable.
export type Filtro = { eventoId?: number; desde?: string; hasta?: string };

function condicionesDeEvento(filtro: Filtro): SQL[] {
  const condiciones: SQL[] = [];
  if (filtro.eventoId) condiciones.push(eq(eventos.id, filtro.eventoId));
  if (filtro.desde) condiciones.push(gte(eventos.fechaDesde, filtro.desde));
  if (filtro.hasta) condiciones.push(lte(eventos.fechaDesde, filtro.hasta));
  return condiciones;
}

const unidades = sql`sum(${ventaItems.cantidad})`.mapWith(Number);
// Importe a precio de lista: el servidor recalcula cada renglón contra el catálogo. El total cobrado
// (con redondeos en efectivo) está en ventas por evento.
const importe = sql`sum(${ventaItems.cantidad} * ${ventaItems.precioUnitario})`.mapWith(Number);

function ventasFiltradas(filtro: Filtro) {
  return and(eq(ventas.anulada, false), ...condicionesDeEvento(filtro));
}

export async function rankingDeProductos(filtro: Filtro, limite = 20) {
  return db()
    .select({ productoId: productos.id, producto: productos.nombre, marca: productos.marca, categoria: productos.categoria, unidades, importe })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .innerJoin(eventos, eq(eventos.id, ventas.eventoId))
    .innerJoin(variantes, eq(variantes.id, ventaItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(ventasFiltradas(filtro))
    .groupBy(productos.id)
    .orderBy(desc(unidades), asc(productos.nombre))
    .limit(limite);
}

export async function rankingDeTallesPorCategoria(filtro: Filtro) {
  const filas = await db()
    .select({ categoria: productos.categoria, talle: variantes.talle, unidades })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .innerJoin(eventos, eq(eventos.id, ventas.eventoId))
    .innerJoin(variantes, eq(variantes.id, ventaItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(ventasFiltradas(filtro))
    .groupBy(productos.categoria, variantes.talle)
    .orderBy(asc(productos.categoria), desc(unidades), asc(variantes.talle));

  const porCategoria = new Map<string, { talle: string; unidades: number }[]>();
  for (const f of filas) porCategoria.set(f.categoria, [...(porCategoria.get(f.categoria) ?? []), { talle: f.talle, unidades: f.unidades }]);
  return [...porCategoria].map(([categoria, talles]) => ({ categoria, talles, total: talles.reduce((s, t) => s + t.unidades, 0) }));
}

// Ranking por vendedor: quién vendió cuánto con su PIN en el celular. Ventas y plata se cuentan
// sobre ventas; unidades, sobre renglones. En dos consultas para no multiplicar el total por renglón.
export async function rankingDeVendedores(filtro: Filtro) {
  const porVentas = await db()
    .select({
      usuarioId: ventas.usuarioId,
      vendedor: usuarios.nombre,
      ventas: sql`count(*)`.mapWith(Number),
      facturado: sql`coalesce(sum(${ventas.total}), 0)`.mapWith(Number),
    })
    .from(ventas)
    .innerJoin(eventos, eq(eventos.id, ventas.eventoId))
    .leftJoin(usuarios, eq(usuarios.id, ventas.usuarioId))
    .where(ventasFiltradas(filtro))
    .groupBy(ventas.usuarioId, usuarios.nombre);
  const porUnidades = await db()
    .select({ usuarioId: ventas.usuarioId, unidades })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .innerJoin(eventos, eq(eventos.id, ventas.eventoId))
    .where(ventasFiltradas(filtro))
    .groupBy(ventas.usuarioId);
  const unidadesDe = new Map(porUnidades.map((u) => [u.usuarioId, u.unidades]));
  return porVentas
    .map((v) => ({ ...v, unidades: unidadesDe.get(v.usuarioId) ?? 0, ticket: v.ventas > 0 ? v.facturado / v.ventas : 0 }))
    .sort((a, b) => b.facturado - a.facturado);
}

// Stock actual por ubicación, a precio de lista, con filtro por producto, marca o SKU.
export async function stockPorUbicacion(texto: string) {
  const buscado = texto.trim();
  const coincide = buscado
    ? or(ilike(productos.nombre, `%${buscado}%`), ilike(productos.marca, `%${buscado}%`), ilike(variantes.sku, `%${buscado}%`))
    : undefined;
  return db()
    .select({
      ubicacionId: ubicaciones.id,
      ubicacion: ubicaciones.nombre,
      tipo: ubicaciones.tipo,
      unidades: sql`sum(${stockActual.cantidad})`.mapWith(Number),
      valor: sql`sum(${stockActual.cantidad} * ${variantes.precio})`.mapWith(Number),
      variantesConStock: sql`count(*) filter (where ${stockActual.cantidad} > 0)`.mapWith(Number),
    })
    .from(stockActual)
    .innerJoin(ubicaciones, eq(ubicaciones.id, stockActual.ubicacionId))
    .innerJoin(variantes, eq(variantes.id, stockActual.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(eq(ubicaciones.activa, true), coincide))
    .groupBy(ubicaciones.id)
    .having(sql`sum(${stockActual.cantidad}) <> 0`)
    .orderBy(asc(ubicaciones.id));
}

export async function eventosParaFiltro() {
  return db().select({ id: eventos.id, nombre: eventos.nombre, fechaDesde: eventos.fechaDesde }).from(eventos).orderBy(desc(eventos.fechaDesde));
}

export function filtroDeEventosParaResumen(filtro: Filtro) {
  const condiciones = condicionesDeEvento(filtro);
  return condiciones.length > 0 ? and(...condiciones) : undefined;
}
