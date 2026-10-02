import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { crearProductoAccion, ingresarMercaderiaAccion } from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { productos, ubicaciones, variantes } from "@/db/esquema";
import { pesos } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, Formulario, Selector, Vacio } from "@/componentes/primitivos";

// La lista es liviana a propósito: se usa desde el depósito con la señal que haya.
// Precios, talles y estado de cada variante se editan en la página del producto.
export default async function Catalogo({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const condiciones: SQL[] = [];
  if (q.trim()) {
    const patron = `%${q.trim()}%`;
    const coincide = or(ilike(productos.nombre, patron), ilike(productos.marca, patron), ilike(productos.categoria, patron));
    if (coincide) condiciones.push(coincide);
  }

  const lista = await db()
    .select({
      id: productos.id,
      nombre: productos.nombre,
      marca: productos.marca,
      categoria: productos.categoria,
      activo: productos.activo,
      variantes: sql`count(${variantes.id})`.mapWith(Number),
      precioMinimo: sql`min(${variantes.precio})`.mapWith(Number),
      precioMaximo: sql`max(${variantes.precio})`.mapWith(Number),
      skus: sql<string>`string_agg(${variantes.sku}, ' ' order by ${variantes.id})`,
      stock: sql`(select coalesce(sum(s.cantidad), 0) from stock_actual s join variantes v on v.id = s.variante_id where v.producto_id = "productos"."id")`.mapWith(
        Number,
      ),
    })
    .from(productos)
    .leftJoin(variantes, eq(variantes.productoId, productos.id))
    .where(and(...condiciones))
    .groupBy(productos.id)
    .orderBy(asc(productos.categoria), asc(productos.id));
  const destinos = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.activa, true), inArray(ubicaciones.tipo, ["deposito", "showroom"])))
    .orderBy(asc(ubicaciones.id));
  const categorias = await db().selectDistinct({ categoria: productos.categoria }).from(productos).orderBy(asc(productos.categoria));

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
              <option key={c.categoria} value={c.categoria} />
            ))}
          </datalist>
        </section>
      </div>

      <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo etiqueta="Buscar producto" name="q" defaultValue={q} placeholder="Nombre, marca o categoría" />
        <Boton type="submit">Buscar</Boton>
      </form>

      {lista.length === 0 ? (
        <Vacio titulo={q ? "Ningún producto coincide" : "El catálogo está vacío"}>
          {q ? "Probá con otra palabra." : "Creá el primer producto con el formulario de arriba."}
        </Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-black">
          <table className="w-full border-collapse text-left">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2">Producto</th>
                <th className="p-2">Categoría</th>
                <th className="p-2">SKU</th>
                <th className="p-2 text-right">Precio</th>
                <th className="p-2 text-right">Stock total</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={`border-t border-neutral-300 ${p.activo ? "" : "text-neutral-500"}`}>
                  <td className="p-2">
                    <Link href={`/panel/catalogo/${p.id}`} className="font-bold underline">
                      {p.nombre}
                    </Link>{" "}
                    <span className="text-neutral-600">{p.marca}</span>
                    {!p.activo && <span className="ml-2 text-xs font-bold uppercase">inactivo</span>}
                  </td>
                  <td className="p-2">{p.categoria}</td>
                  <td className="p-2 font-mono text-sm">{p.skus}</td>
                  <td className="p-2 text-right tabular-nums">
                    {p.precioMinimo === p.precioMaximo ? pesos(p.precioMinimo) : `${pesos(p.precioMinimo)} a ${pesos(p.precioMaximo)}`}
                  </td>
                  <td className="p-2 text-right tabular-nums">{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
