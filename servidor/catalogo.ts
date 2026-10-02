import { eq } from "drizzle-orm";
import { db } from "@/db/conexion";
import { movimientos, productos, ubicaciones, variantes } from "@/db/esquema";

// SKU corto, para tipear con teclado numérico en el evento: número de producto + número de
// variante en dos dígitos. "101" es la primera variante del producto 1; "1902", la segunda del 19.
// Los dos dígitos fijos del final hacen que dos productos distintos nunca den el mismo SKU.
function sku(productoId: number, numeroDeVariante: number) {
  if (numeroDeVariante > 99) throw new Error("Un producto no puede tener más de 99 variantes");
  return `${productoId}${String(numeroDeVariante).padStart(2, "0")}`;
}

export type DatosVariante = { talle: string; color: string; precio: number; costo?: number | null; imagenUrl?: string | null };

export async function crearProducto(datos: { nombre: string; marca: string; categoria: string; variantes: DatosVariante[] }) {
  return db().transaction(async (tx) => {
    const [producto] = await tx
      .insert(productos)
      .values({ nombre: datos.nombre, marca: datos.marca, categoria: datos.categoria })
      .returning();
    if (!producto) throw new Error("No se creó el producto");
    const filas = await tx
      .insert(variantes)
      .values(datos.variantes.map((v, i) => ({ ...v, productoId: producto.id, sku: sku(producto.id, i + 1) })))
      .returning();
    return { producto, variantes: filas };
  });
}

export async function agregarVariante(productoId: number, datos: DatosVariante) {
  return db().transaction(async (tx) => {
    const cuantas = await tx.$count(variantes, eq(variantes.productoId, productoId));
    const [variante] = await tx
      .insert(variantes)
      .values({ ...datos, productoId, sku: sku(productoId, cuantas + 1) })
      .returning();
    if (!variante) throw new Error("No se creó la variante");
    return variante;
  });
}

// No se borra nada del catálogo: hay ventas y movimientos que lo referencian. Se desactiva.
export async function actualizarVariante(id: number, cambios: { precio?: number; activo?: boolean }) {
  await db().update(variantes).set(cambios).where(eq(variantes.id, id));
}

export async function actualizarProducto(id: number, cambios: { activo: boolean } | { nombre: string; marca: string; categoria: string }) {
  await db().update(productos).set(cambios).where(eq(productos.id, id));
}

// Mercadería que entra al negocio: es el único movimiento sin origen.
export async function registrarIngreso(ubicacionId: number, items: { varianteId: number; cantidad: number }[], ocurridoAt = new Date()) {
  await db()
    .insert(movimientos)
    .values(items.map((item) => ({ ...item, ubicacionDestinoId: ubicacionId, tipo: "carga_inicial" as const, ocurridoAt })));
}

// Las ubicaciones de tipo evento se crean solas con cada evento.
export async function crearUbicacion(nombre: string, tipo: "deposito" | "showroom" | "web") {
  const [ubicacion] = await db().insert(ubicaciones).values({ nombre, tipo }).returning();
  if (!ubicacion) throw new Error("No se creó la ubicación");
  return ubicacion;
}

export async function renombrarUbicacion(id: number, nombre: string) {
  await db().update(ubicaciones).set({ nombre }).where(eq(ubicaciones.id, id));
}

export async function cambiarUbicacionActiva(id: number, activa: boolean) {
  await db().update(ubicaciones).set({ activa }).where(eq(ubicaciones.id, id));
}
