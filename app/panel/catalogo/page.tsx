import Link from "next/link";
import { and, asc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { crearProductoAccion, ingresarMercaderiaAccion } from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { productos, ubicaciones, variantes } from "@/db/esquema";
import { pesos } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Formulario, Indicador, Insignia, Selector, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";

// La lista es liviana a propósito: se usa desde el depósito con la señal que haya.
// Precios, talles y estado de cada variante se editan en la página del producto.
export default async function Catalogo({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const yo = await paginaConPermiso("ver");
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

  const opera = puede(yo.rol, "operar");
  const activos = lista.filter((p) => p.activo).length;

  return (
    <>
      <EncabezadoDePagina
        titulo="Catálogo"
        descripcion="Productos con sus talles y colores. Precios, talles y estado de cada variante se editan en la página del producto."
        acciones={<EnlaceBoton href="/panel/exportar/stock">Exportar stock CSV</EnlaceBoton>}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Productos" valor={lista.length} detalle={`${activos} activos`} />
        <Indicador titulo="Variantes" valor={lista.reduce((s, p) => s + p.variantes, 0)} />
        <Indicador titulo="Categorías" valor={categorias.length} />
        <Indicador titulo="Unidades en stock" valor={lista.reduce((s, p) => s + p.stock, 0).toLocaleString("es-AR")} href="/panel/stock" />
      </div>

      {opera && (
        <div className="grid gap-6 xl:grid-cols-2">
          <Tarjeta titulo="Ingresar mercadería" descripcion="Correcciones rápidas sin proveedor. Lo que entra de un proveedor va por Compras, con costo.">
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
          </Tarjeta>

          <Tarjeta titulo="Nuevo producto" descripcion="Se crea una variante por cada combinación de talle y color, con su SKU corto.">
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
          </Tarjeta>
        </div>
      )}

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo etiqueta="Buscar producto" name="q" defaultValue={q} placeholder="Nombre, marca o categoría" />
        <Boton type="submit">Buscar</Boton>
      </form>

      {lista.length === 0 ? (
        <Vacio titulo={q ? "Ningún producto coincide" : "El catálogo está vacío"}>
          {q ? "Probá con otra palabra." : "Creá el primer producto con el formulario de arriba."}
        </Vacio>
      ) : (
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>SKU</th>
                <th className="numero">Precio</th>
                <th className="numero">Stock total</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={p.activo ? "" : "text-neutral-500"}>
                  <td>
                    <Link href={`/panel/catalogo/${p.id}`} className="font-bold underline">
                      {p.nombre}
                    </Link>{" "}
                    <span className="text-neutral-600">{p.marca}</span>
                  </td>
                  <td>{p.categoria}</td>
                  <td className="font-mono text-xs">{p.skus}</td>
                  <td className="numero">
                    {p.precioMinimo === p.precioMaximo ? pesos(p.precioMinimo) : `${pesos(p.precioMinimo)} a ${pesos(p.precioMaximo)}`}
                  </td>
                  <td className="numero font-bold">{p.stock}</td>
                  <td>{p.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Inactivo</Insignia>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>
      )}
    </>
  );
}
