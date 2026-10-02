import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import {
  agregarVarianteAccion,
  cambiarPrecioAccion,
  cambiarProductoActivoAccion,
  cambiarVarianteActivaAccion,
  editarProductoAccion,
} from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { productos, variantes } from "@/db/esquema";
import { pesos } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, Formulario } from "@/componentes/primitivos";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [producto] = await db().select().from(productos).where(eq(productos.id, id));
  if (!producto) notFound();

  const lista = await db()
    .select({
      id: variantes.id,
      sku: variantes.sku,
      talle: variantes.talle,
      color: variantes.color,
      precio: variantes.precio,
      activo: variantes.activo,
      // Columna de la variante escrita a mano y calificada: la consulta no tiene JOINs.
      stock: sql`(select coalesce(sum(s.cantidad), 0) from stock_actual s where s.variante_id = "variantes"."id")`.mapWith(Number),
    })
    .from(variantes)
    .where(eq(variantes.productoId, id))
    .orderBy(asc(variantes.id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/panel/catalogo" className="text-sm underline">
          ← Catálogo
        </Link>
        <h1 className="text-3xl font-black">
          {producto.nombre} {!producto.activo && <span className="text-base font-bold uppercase text-neutral-500">inactivo</span>}
        </h1>
        <p className="text-lg">
          {producto.marca} · {producto.categoria}
        </p>
      </div>

      <section className="rounded-lg border-2 border-black p-4">
        <h2 className="mb-3 text-xl font-bold">Datos del producto</h2>
        <Formulario accion={editarProductoAccion.bind(null, producto.id)} className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Campo etiqueta="Nombre" name="nombre" defaultValue={producto.nombre} required />
          <Campo etiqueta="Marca" name="marca" defaultValue={producto.marca} required />
          <Campo etiqueta="Categoría" name="categoria" defaultValue={producto.categoria} required />
          <BotonEnviar>Guardar</BotonEnviar>
        </Formulario>
        <form action={cambiarProductoActivoAccion.bind(null, producto.id, !producto.activo)} className="mt-3">
          <Boton variante="secundario">{producto.activo ? "Desactivar producto" : "Reactivar producto"}</Boton>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Talles y colores</h2>
        <div className="overflow-x-auto rounded-lg border-2 border-black">
          <table className="w-full border-collapse text-left">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2">SKU</th>
                <th className="p-2">Talle</th>
                <th className="p-2">Color</th>
                <th className="p-2">Precio</th>
                <th className="p-2 text-right">Stock total</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id} className={`border-t border-neutral-300 ${v.activo ? "" : "text-neutral-500"}`}>
                  <td className="p-2 font-mono font-bold">{v.sku}</td>
                  <td className="p-2 font-bold">{v.talle}</td>
                  <td className="p-2">{v.color}</td>
                  <td className="p-2">
                    <Formulario accion={cambiarPrecioAccion.bind(null, v.id)} className="flex flex-wrap items-center gap-2">
                      <input
                        name="precio"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        defaultValue={v.precio}
                        aria-label={`Precio de ${v.talle} ${v.color}, hoy ${pesos(v.precio)}`}
                        className="min-h-12 w-32 rounded-lg border-2 border-black px-2 tabular-nums"
                      />
                      <BotonEnviar variante="secundario" className="text-sm">
                        Guardar
                      </BotonEnviar>
                    </Formulario>
                  </td>
                  <td className="p-2 text-right tabular-nums">{v.stock}</td>
                  <td className="p-2 text-right">
                    <form action={cambiarVarianteActivaAccion.bind(null, v.id, !v.activo)}>
                      <Boton variante="secundario" className="text-sm">
                        {v.activo ? "Desactivar" : "Reactivar"}
                      </Boton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm">Un precio nuevo llega a los celulares cuando actualizan el paquete del evento.</p>
      </section>

      <section className="rounded-lg border-2 border-black p-4">
        <h2 className="mb-3 text-xl font-bold">Agregar talle o color</h2>
        <Formulario accion={agregarVarianteAccion.bind(null, producto.id)} className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Campo etiqueta="Talle" name="talle" required />
          <Campo etiqueta="Color" name="color" required />
          <Campo etiqueta="Precio" name="precio" type="number" inputMode="numeric" min={0} required defaultValue={lista[0]?.precio} />
          <BotonEnviar>Agregar</BotonEnviar>
        </Formulario>
      </section>
    </div>
  );
}
