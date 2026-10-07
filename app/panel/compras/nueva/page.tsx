import { and, asc, eq, inArray } from "drizzle-orm";
import { FormularioDeCompra } from "@/app/panel/compras/nueva/formulario-de-compra";
import { db } from "@/db/conexion";
import { productos, proveedores, ubicaciones, variantes } from "@/db/esquema";
import { EncabezadoDePagina, EnlaceBoton, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { hoyArgentino } from "@/servidor/compras";

export default async function NuevaCompra({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  await paginaConPermiso("operar");
  const pedido = Number((await searchParams).proveedor);
  const [lista, destinos, activos] = await Promise.all([
    db()
      .select({
        varianteId: variantes.id,
        producto: productos.nombre,
        marca: productos.marca,
        talle: variantes.talle,
        color: variantes.color,
        sku: variantes.sku,
        costo: variantes.costo,
      })
      .from(variantes)
      .innerJoin(productos, eq(productos.id, variantes.productoId))
      .where(and(eq(variantes.activo, true), eq(productos.activo, true)))
      .orderBy(asc(productos.nombre), asc(variantes.id)),
    db()
      .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
      .from(ubicaciones)
      .where(and(eq(ubicaciones.activa, true), inArray(ubicaciones.tipo, ["deposito", "showroom"])))
      .orderBy(asc(ubicaciones.id)),
    db().select({ id: proveedores.id, nombre: proveedores.nombre }).from(proveedores).where(eq(proveedores.activo, true)).orderBy(asc(proveedores.nombre)),
  ]);

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/compras", nombre: "Compras" }]}
        titulo="Nueva compra"
        descripcion="Lo que entra suma stock en el destino, y el costo de cada variante pasa a ser el de esta compra."
      />
      {activos.length === 0 ? (
        <Vacio titulo="Primero cargá un proveedor">
          <EnlaceBoton href="/panel/proveedores">Ir a Proveedores</EnlaceBoton>
        </Vacio>
      ) : (
        <FormularioDeCompra
          variantes={lista}
          proveedores={activos}
          destinos={destinos}
          hoy={hoyArgentino()}
          proveedorInicial={activos.some((p) => p.id === pedido) ? pedido : null}
        />
      )}
    </>
  );
}
