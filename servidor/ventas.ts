import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, eq, gte, ilike, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, eventos, movimientos, productos, usuarios, variantes, ventaItems, ventas } from "@/db/esquema";
import { diaArgentino, leerListado, parametro, POR_PAGINA, type ParametrosDeListado } from "@/servidor/listados";

// Ventas de todos los eventos, para el panel. Se ordenan y filtran por la hora del servidor:
// el reloj del celular se muestra, pero puede estar corrido.

const vendedor = alias(usuarios, "vendedor");
const revisor = alias(usuarios, "revisor");


function filtros(parametros: ParametrosDeListado) {
  const condiciones: SQL[] = [];
  const entero = (clave: string) => {
    const n = Number(parametro(parametros, clave));
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  const evento = entero("evento");
  if (evento) condiciones.push(eq(ventas.eventoId, evento));
  const vendedorId = entero("vendedor");
  if (vendedorId) condiciones.push(eq(ventas.usuarioId, vendedorId));
  const celular = entero("celular");
  if (celular) condiciones.push(eq(ventas.deviceId, celular));
  const medio = parametro(parametros, "medio");
  if (medio === "efectivo" || medio === "transferencia" || medio === "tarjeta") condiciones.push(eq(ventas.medioPago, medio));
  const estado = parametro(parametros, "estado");
  if (estado === "revisar") condiciones.push(eq(ventas.paraRevisar, true), isNull(ventas.revisadaAt));
  if (estado === "revisadas") condiciones.push(isNotNull(ventas.revisadaAt));
  const desde = diaArgentino(parametro(parametros, "desde"));
  if (desde) condiciones.push(gte(ventas.recibidoAt, desde));
  const hasta = diaArgentino(parametro(parametros, "hasta"), 1);
  if (hasta) condiciones.push(lt(ventas.recibidoAt, hasta));
  const q = parametro(parametros, "q")?.trim();
  if (q) {
    condiciones.push(/^\d+$/.test(q) ? eq(ventas.id, Number(q)) : ilike(sql`${ventas.clientUuid}::text`, `${q}%`));
  }
  return and(...condiciones);
}

// Columna de la venta escrita a mano y calificada: un subselect correlacionado (ver servidor/eventos.ts).
const unidades = sql`(select coalesce(sum(vi.cantidad), 0) from venta_items vi where vi.venta_id = "ventas"."id")`.mapWith(Number);

export async function listarVentas(parametros: ParametrosDeListado, todo = false) {
  const listado = leerListado(parametros, { fecha: ventas.recibidoAt, total: ventas.total, evento: eventos.nombre, numero: ventas.id }, "fecha");
  const donde = filtros(parametros);
  const consulta = db()
    .select({
      id: ventas.id,
      clientUuid: ventas.clientUuid,
      recibidoAt: ventas.recibidoAt,
      vendidoAt: ventas.vendidoAt,
      eventoId: ventas.eventoId,
      evento: eventos.nombre,
      celular: dispositivos.nombre,
      vendedor: vendedor.nombre,
      medioPago: ventas.medioPago,
      total: ventas.total,
      totalCatalogo: ventas.totalCatalogo,
      unidades,
      paraRevisar: ventas.paraRevisar,
      motivoRevision: ventas.motivoRevision,
      revisadaAt: ventas.revisadaAt,
    })
    .from(ventas)
    .leftJoin(eventos, eq(eventos.id, ventas.eventoId))
    .innerJoin(dispositivos, eq(dispositivos.id, ventas.deviceId))
    .leftJoin(vendedor, eq(vendedor.id, ventas.usuarioId))
    .where(donde)
    .orderBy(listado.orden, sql`${ventas.id} desc`);
  const filas = todo ? await consulta : await consulta.limit(POR_PAGINA).offset(listado.desplazamiento);

  const [resumen] = await db()
    .select({ total: count(), facturado: sql`coalesce(sum(${ventas.total}), 0)`.mapWith(Number) })
    .from(ventas)
    .leftJoin(eventos, eq(eventos.id, ventas.eventoId))
    .where(donde);
  const [items] = await db()
    .select({ unidades: sql`coalesce(sum(${ventaItems.cantidad}), 0)`.mapWith(Number) })
    .from(ventaItems)
    .innerJoin(ventas, eq(ventas.id, ventaItems.ventaId))
    .leftJoin(eventos, eq(eventos.id, ventas.eventoId))
    .where(donde);
  if (!resumen || !items) throw new Error("Los totales del listado no devolvieron ninguna fila");
  return { filas, total: resumen.total, facturado: resumen.facturado, unidades: items.unidades, ...listado };
}

export async function ventaConDetalle(id: number) {
  const [venta] = await db()
    .select({
      venta: ventas,
      evento: eventos.nombre,
      celular: dispositivos.nombre,
      vendedor: vendedor.nombre,
      revisor: revisor.nombre,
    })
    .from(ventas)
    .leftJoin(eventos, eq(eventos.id, ventas.eventoId))
    .innerJoin(dispositivos, eq(dispositivos.id, ventas.deviceId))
    .leftJoin(vendedor, eq(vendedor.id, ventas.usuarioId))
    .leftJoin(revisor, eq(revisor.id, ventas.revisadaPor))
    .where(eq(ventas.id, id));
  if (!venta) return null;

  const renglones = await db()
    .select({
      id: ventaItems.id,
      cantidad: ventaItems.cantidad,
      precioUnitario: ventaItems.precioUnitario,
      productoId: productos.id,
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
    })
    .from(ventaItems)
    .innerJoin(variantes, eq(variantes.id, ventaItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(ventaItems.ventaId, id))
    .orderBy(asc(ventaItems.id));

  const asientos = await db()
    .select({ id: movimientos.id, cantidad: movimientos.cantidad, clientUuid: movimientos.clientUuid, recibidoAt: movimientos.recibidoAt, sku: variantes.sku })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .where(and(eq(movimientos.tipo, "venta"), eq(movimientos.refId, id)))
    .orderBy(asc(movimientos.id));

  return { ...venta, renglones, asientos };
}

// La revisión no borra la marca: queda quién la miró, cuándo y qué concluyó.
export async function marcarRevisada(id: number, usuarioId: number, nota: string) {
  const [marcada] = await db()
    .update(ventas)
    .set({ revisadaAt: new Date(), revisadaPor: usuarioId, notaDeRevision: nota })
    .where(and(eq(ventas.id, id), eq(ventas.paraRevisar, true), isNull(ventas.revisadaAt)))
    .returning({ id: ventas.id });
  return marcada !== undefined;
}
