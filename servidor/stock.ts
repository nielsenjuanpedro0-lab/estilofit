import { and, asc, eq, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, productos, stockActual, ubicaciones, variantes } from "@/db/esquema";

// Las ubicaciones que pueden tener stock: las activas, menos los eventos cerrados, que ya devolvieron todo.
export async function ubicacionesConStock() {
  return db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre, tipo: ubicaciones.tipo })
    .from(ubicaciones)
    .leftJoin(eventos, eq(eventos.ubicacionId, ubicaciones.id))
    .where(and(eq(ubicaciones.activa, true), or(isNull(eventos.id), ne(eventos.estado, "cerrado"))))
    .orderBy(asc(ubicaciones.id));
}

// Stock actual: una fila por variante y una columna por ubicación.
export async function matrizDeStock(filtro: { q?: string; categoria?: string; ubicacion?: number }) {
  const columnas = (await ubicacionesConStock()).filter((c) => !filtro.ubicacion || c.id === filtro.ubicacion);

  const condiciones: SQL[] = [];
  const q = filtro.q?.trim();
  if (q) {
    const coincide = or(ilike(productos.nombre, `%${q}%`), ilike(productos.marca, `%${q}%`), ilike(variantes.sku, `${q}%`));
    if (coincide) condiciones.push(coincide);
  }
  if (filtro.categoria) condiciones.push(eq(productos.categoria, filtro.categoria));

  const variantesListadas = await db()
    .select({
      id: variantes.id,
      productoId: productos.id,
      sku: variantes.sku,
      talle: variantes.talle,
      color: variantes.color,
      precio: variantes.precio,
      activo: variantes.activo,
      producto: productos.nombre,
      marca: productos.marca,
      categoria: productos.categoria,
    })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(...condiciones))
    .orderBy(asc(productos.categoria), asc(productos.id), asc(variantes.id));

  const stock =
    variantesListadas.length === 0 || columnas.length === 0
      ? []
      : await db()
          .select()
          .from(stockActual)
          .where(and(inArray(stockActual.ubicacionId, columnas.map((c) => c.id)), inArray(stockActual.varianteId, variantesListadas.map((f) => f.id))));
  const cantidad = new Map(stock.map((s) => [`${s.varianteId}-${s.ubicacionId}`, s.cantidad]));

  const filas = variantesListadas.map((v) => {
    const porUbicacion = columnas.map((c) => cantidad.get(`${v.id}-${c.id}`) ?? 0);
    return { ...v, porUbicacion, total: porUbicacion.reduce((a, b) => a + b, 0) };
  });
  const totales = columnas.map((_, i) => filas.reduce((suma, f) => suma + (f.porUbicacion[i] ?? 0), 0));
  return { columnas, filas, totales };
}

export async function categorias() {
  return (await db().selectDistinct({ categoria: productos.categoria }).from(productos).orderBy(asc(productos.categoria))).map((c) => c.categoria);
}
