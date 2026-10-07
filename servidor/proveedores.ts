import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { compraItems, compras, productos, proveedores, variantes } from "@/db/esquema";

// Quién nos vende la mercadería. Sin cuenta corriente: solo los datos de contacto y sus compras.

export type DatosProveedor = { nombre: string; cuit: string | null; telefono: string | null; email: string | null; nota: string | null };

export async function crearProveedor(datos: DatosProveedor) {
  const [proveedor] = await db().insert(proveedores).values(datos).returning();
  if (!proveedor) throw new Error("No se creó el proveedor");
  return proveedor;
}

export async function editarProveedor(id: number, datos: DatosProveedor) {
  await db().update(proveedores).set(datos).where(eq(proveedores.id, id));
}

export async function cambiarProveedorActivo(id: number, activo: boolean) {
  await db().update(proveedores).set({ activo }).where(eq(proveedores.id, id));
}

// "Salomon" y "salomon" son el mismo proveedor cargado dos veces.
export async function nombreDeProveedorEnUso(nombre: string, salvoId: number | null) {
  const mismoNombre = sql`lower(${proveedores.nombre}) = lower(${nombre})`;
  const [otro] = await db()
    .select({ id: proveedores.id })
    .from(proveedores)
    .where(salvoId === null ? mismoNombre : and(mismoNombre, ne(proveedores.id, salvoId)));
  return otro !== undefined;
}

// Columnas del proveedor escritas a mano y calificadas: subselects correlacionados, sin JOINs.
const cantidadDeCompras = sql`(select count(*) from compras c where c.proveedor_id = "proveedores"."id" and not c.anulada)`.mapWith(Number);
const ultimaCompra = sql<string | null>`(select max(c.fecha)::text from compras c where c.proveedor_id = "proveedores"."id" and not c.anulada)`;

export async function listarProveedores() {
  return db()
    .select({
      id: proveedores.id,
      nombre: proveedores.nombre,
      cuit: proveedores.cuit,
      telefono: proveedores.telefono,
      email: proveedores.email,
      activo: proveedores.activo,
      compras: cantidadDeCompras,
      ultimaCompra,
    })
    .from(proveedores)
    .orderBy(desc(proveedores.activo), asc(proveedores.nombre));
}

// Lo que más se le compró, en unidades, sin contar compras anuladas.
export async function loMasCompradoA(proveedorId: number, limite = 10) {
  const unidades = sql`sum(${compraItems.cantidad})`.mapWith(Number);
  return db()
    .select({ productoId: productos.id, producto: productos.nombre, marca: productos.marca, unidades })
    .from(compraItems)
    .innerJoin(compras, eq(compras.id, compraItems.compraId))
    .innerJoin(variantes, eq(variantes.id, compraItems.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(eq(compras.proveedorId, proveedorId), eq(compras.anulada, false)))
    .groupBy(productos.id)
    .orderBy(desc(unidades), asc(productos.nombre))
    .limit(limite);
}
