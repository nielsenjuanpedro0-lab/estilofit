import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, eventos, productos, stockActual, ubicaciones, variantes, ventaItems, ventas } from "@/db/esquema";
import { resumenDeEventos } from "@/servidor/eventos";

// Lo que se ve al entrar al panel: cómo vienen las ventas, qué está en curso y qué hay que mirar ya.

const DIAS_DEL_PERIODO = 30;
// Stock bajo: lo que queda entre depósito y showroom para reponer o mandar a un evento.
const UMBRAL_STOCK_BAJO = 2;

export async function datosDelTablero() {
  const desde = new Date(Date.now() - DIAS_DEL_PERIODO * 24 * 60 * 60 * 1000);
  const recientes = and(gte(ventas.recibidoAt, desde), eq(ventas.anulada, false));

  const [periodo] = await db()
    .select({
      ventas: sql`count(*)`.mapWith(Number),
      facturado: sql`coalesce(sum(${ventas.total}), 0)`.mapWith(Number),
    })
    .from(ventas)
    .where(recientes);
  const [unidadesDelPeriodo] = await db()
    .select({ unidades: sql`coalesce(sum(${ventaItems.cantidad}), 0)`.mapWith(Number) })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .where(recientes);
  if (!periodo || !unidadesDelPeriodo) throw new Error("Las cuentas del tablero no devolvieron ninguna fila");

  // El stock que se puede vender o mandar: depósitos y showrooms, sin lo que está en eventos.
  const fijas = await db().select({ id: ubicaciones.id }).from(ubicaciones).where(inArray(ubicaciones.tipo, ["deposito", "showroom"]));
  const idsFijas = fijas.map((u) => u.id);
  const [stock] = await db()
    .select({
      unidades: sql`coalesce(sum(${stockActual.cantidad}), 0)`.mapWith(Number),
      valor: sql`coalesce(sum(${stockActual.cantidad} * ${variantes.precio}), 0)`.mapWith(Number),
    })
    .from(stockActual)
    .innerJoin(variantes, eq(variantes.id, stockActual.varianteId))
    .where(idsFijas.length > 0 ? inArray(stockActual.ubicacionId, idsFijas) : sql`false`);
  if (!stock) throw new Error("La suma del stock no devolvió ninguna fila");

  const stockBajo = await db()
    .select({
      varianteId: variantes.id,
      productoId: productos.id,
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
      cantidad: sql`coalesce(sum(${stockActual.cantidad}), 0)`.mapWith(Number),
    })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .leftJoin(stockActual, and(eq(stockActual.varianteId, variantes.id), idsFijas.length > 0 ? inArray(stockActual.ubicacionId, idsFijas) : sql`false`))
    .where(and(eq(variantes.activo, true), eq(productos.activo, true)))
    .groupBy(variantes.id, productos.id)
    .having(lte(sql`coalesce(sum(${stockActual.cantidad}), 0)`, UMBRAL_STOCK_BAJO))
    .orderBy(asc(sql`coalesce(sum(${stockActual.cantidad}), 0)`), asc(productos.nombre))
    .limit(10);

  const masVendidos = await db()
    .select({
      productoId: productos.id,
      producto: productos.nombre,
      marca: productos.marca,
      unidades: sql`sum(${ventaItems.cantidad})`.mapWith(Number),
    })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .innerJoin(variantes, eq(variantes.id, ventaItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(recientes)
    .groupBy(productos.id)
    .orderBy(desc(sql`sum(${ventaItems.cantidad})`))
    .limit(5);

  const enCurso = await resumenDeEventos(ne(eventos.estado, "cerrado"));
  const paraRevisar = await db().$count(ventas, and(eq(ventas.paraRevisar, true), isNull(ventas.revisadaAt)));
  const celularesConPendientes = await db()
    .select({ id: dispositivos.id, nombre: dispositivos.nombre, pendientes: dispositivos.pendientesInformadas, informadoAt: dispositivos.pendientesInformadasAt })
    .from(dispositivos)
    .where(and(isNull(dispositivos.revocadoAt), gt(dispositivos.pendientesInformadas, 0)))
    .orderBy(desc(dispositivos.pendientesInformadas));

  return {
    dias: DIAS_DEL_PERIODO,
    umbralStockBajo: UMBRAL_STOCK_BAJO,
    periodo: { ...periodo, unidades: unidadesDelPeriodo.unidades },
    stock,
    stockBajo,
    masVendidos,
    enCurso,
    paraRevisar,
    celularesConPendientes,
  };
}
