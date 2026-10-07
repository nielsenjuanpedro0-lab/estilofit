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
import { Boton, BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Formulario, Indicador, Insignia, Tarjeta } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const yo = await paginaConPermiso("ver");
  const opera = puede(yo.rol, "operar");
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
      costo: variantes.costo,
      activo: variantes.activo,
      // Columna de la variante escrita a mano y calificada: la consulta no tiene JOINs.
      stock: sql`(select coalesce(sum(s.cantidad), 0) from stock_actual s where s.variante_id = "variantes"."id")`.mapWith(Number),
      vendidas: sql`(select coalesce(sum(vi.cantidad), 0) from venta_items vi join ventas v on v.id = vi.venta_id where vi.variante_id = "variantes"."id" and not v.anulada)`.mapWith(
        Number,
      ),
    })
    .from(variantes)
    .where(eq(variantes.productoId, id))
    .orderBy(asc(variantes.id));
  const stock = lista.reduce((s, v) => s + v.stock, 0);
  const vendidas = lista.reduce((s, v) => s + v.vendidas, 0);

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/catalogo", nombre: "Catálogo" }]}
        titulo={producto.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            {producto.marca} · {producto.categoria}
            {producto.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Inactivo</Insignia>}
          </span>
        }
        acciones={
          <>
            <EnlaceBoton href={`/panel/stock?q=${encodeURIComponent(producto.nombre)}`}>Ver stock por ubicación</EnlaceBoton>
            <EnlaceBoton href={`/panel/movimientos?q=${encodeURIComponent(producto.nombre)}`}>Ver movimientos</EnlaceBoton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Variantes" valor={lista.length} detalle={`${lista.filter((v) => v.activo).length} activas`} />
        <Indicador titulo="Stock total" valor={stock} />
        <Indicador titulo="Vendidas en eventos" valor={vendidas} />
        <Indicador
          titulo="Precio"
          valor={pesos(Math.min(...lista.map((v) => v.precio)))}
          detalle={new Set(lista.map((v) => v.precio)).size > 1 ? "Hay variantes con otro precio" : "Mismo precio en todas"}
        />
      </div>

      <Tarjeta titulo="Talles y colores" descripcion="Un precio nuevo llega a los celulares cuando actualizan el paquete del evento. El costo lo actualiza cada compra.">
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Talle</th>
                <th>Color</th>
                <th>Precio</th>
                <th className="numero">Costo</th>
                <th className="numero">Margen</th>
                <th className="numero">Stock</th>
                <th className="numero">Vendidas</th>
                <th>Estado</th>
                {opera && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((v) => (
                <tr key={v.id} className={v.activo ? "" : "text-neutral-500"}>
                  <td className="font-mono font-bold">{v.sku}</td>
                  <td className="font-bold">{v.talle}</td>
                  <td>{v.color}</td>
                  <td>
                    {opera ? (
                      <Formulario accion={cambiarPrecioAccion.bind(null, v.id)} className="flex flex-wrap items-center gap-2">
                        <input
                          name="precio"
                          type="number"
                          inputMode="numeric"
                          min={0}
                          defaultValue={v.precio}
                          aria-label={`Precio de ${v.talle} ${v.color}, hoy ${pesos(v.precio)}`}
                          className="min-h-11 w-32 rounded-lg border-2 border-black px-2 tabular-nums"
                        />
                        <BotonEnviar variante="secundario" className="min-h-11 text-sm">
                          Guardar
                        </BotonEnviar>
                      </Formulario>
                    ) : (
                      pesos(v.precio)
                    )}
                  </td>
                  <td className="numero">{v.costo !== null ? pesos(v.costo) : <span className="text-neutral-500">—</span>}</td>
                  <td className="numero">
                    {v.costo !== null && v.precio > 0 ? `${Math.round(((v.precio - v.costo) / v.precio) * 100)}%` : <span className="text-neutral-500">—</span>}
                  </td>
                  <td className="numero font-bold">{v.stock}</td>
                  <td className="numero">{v.vendidas}</td>
                  <td>{v.activo ? <Insignia tono="bueno">Activa</Insignia> : <Insignia tono="malo">Inactiva</Insignia>}</td>
                  {opera && (
                    <td className="text-right">
                      <form action={cambiarVarianteActivaAccion.bind(null, v.id, !v.activo)}>
                        <Boton variante="secundario" className="min-h-11 text-sm">
                          {v.activo ? "Desactivar" : "Reactivar"}
                        </Boton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>
      </Tarjeta>

      {opera && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Tarjeta titulo="Datos del producto">
            <Formulario accion={editarProductoAccion.bind(null, producto.id)} className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Campo etiqueta="Nombre" name="nombre" defaultValue={producto.nombre} required />
              <Campo etiqueta="Marca" name="marca" defaultValue={producto.marca} required />
              <Campo etiqueta="Categoría" name="categoria" defaultValue={producto.categoria} required />
              <BotonEnviar className="sm:col-span-3">Guardar datos</BotonEnviar>
            </Formulario>
            <form action={cambiarProductoActivoAccion.bind(null, producto.id, !producto.activo)} className="mt-4 border-t border-neutral-300 pt-4">
              <Boton variante={producto.activo ? "peligro" : "secundario"}>{producto.activo ? "Desactivar el producto" : "Reactivar el producto"}</Boton>
            </form>
          </Tarjeta>
          <Tarjeta titulo="Agregar talle o color">
            <Formulario accion={agregarVarianteAccion.bind(null, producto.id)} className="grid gap-3 sm:grid-cols-3 sm:items-end">
              <Campo etiqueta="Talle" name="talle" required />
              <Campo etiqueta="Color" name="color" required />
              <Campo etiqueta="Precio" name="precio" type="number" inputMode="numeric" min={0} required defaultValue={lista[0]?.precio} />
              <BotonEnviar className="sm:col-span-3">Agregar variante</BotonEnviar>
            </Formulario>
          </Tarjeta>
        </div>
      )}

      <p className="text-sm text-neutral-700">
        <Link href="/panel/catalogo" className="underline">
          Volver al catálogo
        </Link>
      </p>
    </>
  );
}
