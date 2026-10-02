import { asc, inArray, sql } from "drizzle-orm";
import {
  agregarVarianteAccion,
  cambiarPrecioAccion,
  cambiarProductoActivoAccion,
  cambiarVarianteActivaAccion,
  crearProductoAccion,
  ingresarMercaderiaAccion,
} from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { productos, ubicaciones, variantes } from "@/db/esquema";
import { pesos } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, Formulario, Selector, Vacio } from "@/componentes/primitivos";

export default async function Catalogo() {
  const lista = await db().select().from(productos).orderBy(asc(productos.categoria), asc(productos.id));
  const todas = await db()
    .select({
      id: variantes.id,
      productoId: variantes.productoId,
      sku: variantes.sku,
      talle: variantes.talle,
      color: variantes.color,
      precio: variantes.precio,
      activo: variantes.activo,
      stock: sql`(select coalesce(sum(s.cantidad), 0) from stock_actual s where s.variante_id = "variantes"."id")`.mapWith(Number),
    })
    .from(variantes)
    .orderBy(asc(variantes.id));
  const destinos = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(inArray(ubicaciones.tipo, ["deposito", "showroom"]))
    .orderBy(asc(ubicaciones.id));
  const categorias = [...new Set(lista.map((p) => p.categoria))];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Catálogo</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border-2 border-black p-4">
          <h2 className="mb-3 text-xl font-bold">Ingresar mercadería</h2>
          <Formulario accion={ingresarMercaderiaAccion} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Campo etiqueta="SKU" name="sku" inputMode="numeric" required />
            <Campo etiqueta="Cantidad" name="cantidad" type="number" inputMode="numeric" min={1} required />
            <Selector etiqueta="Entra a" name="ubicacionId">
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nombre}
                </option>
              ))}
            </Selector>
            <BotonEnviar className="sm:col-span-3">Ingresar</BotonEnviar>
          </Formulario>
        </section>

        <section className="rounded-lg border-2 border-black p-4">
          <h2 className="mb-3 text-xl font-bold">Nuevo producto</h2>
          <Formulario accion={crearProductoAccion} className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Remera técnica Trail" />
            <Campo etiqueta="Marca" name="marca" required placeholder="Ej: Estilofit" />
            <Campo etiqueta="Categoría" name="categoria" required list="categorias" placeholder="Ej: Remeras" />
            <Campo etiqueta="Precio" name="precio" type="number" inputMode="numeric" min={0} required />
            <Campo etiqueta="Talles, separados por coma" name="talles" required placeholder="S, M, L, XL" />
            <Campo etiqueta="Colores, separados por coma" name="colores" required placeholder="Negro, Blanco" />
            <BotonEnviar className="sm:col-span-2">Crear producto con sus variantes</BotonEnviar>
          </Formulario>
          <datalist id="categorias">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </section>
      </div>

      {lista.length === 0 && <Vacio titulo="El catálogo está vacío">Creá el primer producto con el formulario de arriba.</Vacio>}

      {lista.map((p) => (
        <section key={p.id} className={`rounded-lg border-2 border-black ${p.activo ? "" : "opacity-60"}`}>
          <header className="flex flex-wrap items-center gap-2 border-b-2 border-black bg-neutral-100 p-3">
            <h2 className="text-lg font-black">{p.nombre}</h2>
            <span>
              {p.marca} · {p.categoria}
            </span>
            <form action={cambiarProductoActivoAccion.bind(null, p.id, !p.activo)} className="ml-auto">
              <Boton variante="secundario" className="text-sm">
                {p.activo ? "Desactivar producto" : "Reactivar producto"}
              </Boton>
            </form>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
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
                {todas
                  .filter((v) => v.productoId === p.id)
                  .map((v) => (
                    <tr key={v.id} className={`border-t border-neutral-300 ${v.activo ? "" : "text-neutral-500"}`}>
                      <td className="p-2 font-mono font-bold">{v.sku}</td>
                      <td className="p-2">{v.talle}</td>
                      <td className="p-2">{v.color}</td>
                      <td className="p-2">
                        <Formulario accion={cambiarPrecioAccion.bind(null, v.id)} className="flex items-center gap-2">
                          <input
                            name="precio"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            defaultValue={v.precio}
                            aria-label={`Precio de ${p.nombre} ${v.talle} ${v.color}, hoy ${pesos(v.precio)}`}
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
          <details className="border-t border-neutral-300 p-3">
            <summary className="flex min-h-12 cursor-pointer items-center font-bold">Agregar talle o color</summary>
            <Formulario accion={agregarVarianteAccion.bind(null, p.id)} className="mt-2 grid gap-3 sm:grid-cols-4 sm:items-end">
              <Campo etiqueta="Talle" name="talle" required />
              <Campo etiqueta="Color" name="color" required />
              <Campo etiqueta="Precio" name="precio" type="number" inputMode="numeric" min={0} required />
              <BotonEnviar>Agregar</BotonEnviar>
            </Formulario>
          </details>
        </section>
      ))}
    </div>
  );
}
