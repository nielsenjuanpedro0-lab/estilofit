import { alias } from "drizzle-orm/pg-core";
import { and, count, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, movimientos, productos, tipoMovimiento, ubicaciones, usuarios, variantes } from "@/db/esquema";
import { diaArgentino, leerListado, parametro, POR_PAGINA, type ParametrosDeListado } from "@/servidor/listados";

// El libro mayor tal cual: cada entrada y salida de stock, con quién y desde dónde la generó.
// Se lee, nunca se edita: una corrección es otro movimiento.

const origen = alias(ubicaciones, "origen");
const destino = alias(ubicaciones, "destino");
type TipoDeMovimiento = (typeof tipoMovimiento.enumValues)[number];
const esTipo = (t: string | undefined): t is TipoDeMovimiento => tipoMovimiento.enumValues.some((v) => v === t);


function filtros(parametros: ParametrosDeListado) {
  const condiciones: SQL[] = [];
  const tipo = parametro(parametros, "tipo");
  if (esTipo(tipo)) condiciones.push(eq(movimientos.tipo, tipo));
  const ubicacion = Number(parametro(parametros, "ubicacion"));
  if (Number.isInteger(ubicacion) && ubicacion > 0) {
    const enUbicacion = or(eq(movimientos.ubicacionOrigenId, ubicacion), eq(movimientos.ubicacionDestinoId, ubicacion));
    if (enUbicacion) condiciones.push(enUbicacion);
  }
  const usuario = Number(parametro(parametros, "usuario"));
  if (Number.isInteger(usuario) && usuario > 0) condiciones.push(eq(movimientos.usuarioId, usuario));
  const q = parametro(parametros, "q")?.trim();
  if (q) {
    const coincide = or(ilike(productos.nombre, `%${q}%`), ilike(variantes.sku, `${q}%`), ilike(movimientos.nota, `%${q}%`));
    if (coincide) condiciones.push(coincide);
  }
  const desde = diaArgentino(parametro(parametros, "desde"));
  if (desde) condiciones.push(gte(movimientos.recibidoAt, desde));
  const hasta = diaArgentino(parametro(parametros, "hasta"), 1);
  if (hasta) condiciones.push(lt(movimientos.recibidoAt, hasta));
  return and(...condiciones);
}

export async function listarMovimientos(parametros: ParametrosDeListado, todo = false) {
  const listado = leerListado(parametros, { fecha: movimientos.id, cantidad: movimientos.cantidad, tipo: movimientos.tipo }, "fecha");
  const donde = filtros(parametros);
  const consulta = db()
    .select({
      id: movimientos.id,
      ocurridoAt: movimientos.ocurridoAt,
      recibidoAt: movimientos.recibidoAt,
      tipo: movimientos.tipo,
      cantidad: movimientos.cantidad,
      producto: productos.nombre,
      productoId: productos.id,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
      origen: origen.nombre,
      destino: destino.nombre,
      usuario: usuarios.nombre,
      celular: dispositivos.nombre,
      nota: movimientos.nota,
      refId: movimientos.refId,
    })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .leftJoin(origen, eq(origen.id, movimientos.ubicacionOrigenId))
    .leftJoin(destino, eq(destino.id, movimientos.ubicacionDestinoId))
    .leftJoin(usuarios, eq(usuarios.id, movimientos.usuarioId))
    .leftJoin(dispositivos, eq(dispositivos.id, movimientos.deviceId))
    .where(donde)
    .orderBy(listado.orden, sql`${movimientos.id} desc`);
  const filas = todo ? await consulta : await consulta.limit(POR_PAGINA).offset(listado.desplazamiento);

  const [resumen] = await db()
    .select({ total: count(), unidades: sql`coalesce(sum(${movimientos.cantidad}), 0)`.mapWith(Number) })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(donde);
  if (!resumen) throw new Error("count() no devolvió ninguna fila");
  return { filas, total: resumen.total, unidades: resumen.unidades, ...listado };
}
