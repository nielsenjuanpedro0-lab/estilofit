import { and, asc, eq, ilike, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, productos, stockActual, ubicaciones, variantes } from "@/db/esquema";
import { recalcularStockAccion, verificarStockAccion } from "@/app/panel/acciones";
import { Boton, BotonEnviar, Campo, Formulario, Selector, Vacio } from "@/componentes/primitivos";

type Filtros = { q?: string; categoria?: string };

export default async function StockPorUbicacion({ searchParams }: { searchParams: Promise<Filtros> }) {
  const { q = "", categoria = "" } = await searchParams;

  // Columnas: todas las ubicaciones activas menos los eventos ya cerrados, que quedaron en cero.
  const columnas = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre, tipo: ubicaciones.tipo })
    .from(ubicaciones)
    .leftJoin(eventos, eq(eventos.ubicacionId, ubicaciones.id))
    .where(and(eq(ubicaciones.activa, true), or(isNull(eventos.id), ne(eventos.estado, "cerrado"))))
    .orderBy(asc(ubicaciones.id));

  const condiciones: SQL[] = [];
  if (q.trim()) {
    const patron = `%${q.trim()}%`;
    const coincide = or(ilike(productos.nombre, patron), ilike(productos.marca, patron), ilike(variantes.sku, patron));
    if (coincide) condiciones.push(coincide);
  }
  if (categoria) condiciones.push(eq(productos.categoria, categoria));

  const filas = await db()
    .select({
      id: variantes.id,
      sku: variantes.sku,
      talle: variantes.talle,
      color: variantes.color,
      activo: variantes.activo,
      producto: productos.nombre,
      marca: productos.marca,
    })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(...condiciones))
    .orderBy(asc(productos.categoria), asc(productos.id), asc(variantes.id));

  const stock =
    filas.length === 0 || columnas.length === 0
      ? []
      : await db()
          .select()
          .from(stockActual)
          .where(and(inArray(stockActual.ubicacionId, columnas.map((c) => c.id)), inArray(stockActual.varianteId, filas.map((f) => f.id))));
  const cantidad = new Map(stock.map((s) => [`${s.varianteId}-${s.ubicacionId}`, s.cantidad]));

  const categorias = await db().selectDistinct({ categoria: productos.categoria }).from(productos).orderBy(asc(productos.categoria));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-black">Stock por ubicación</h1>

      <form className="grid gap-3 sm:grid-cols-[1fr_16rem_auto] sm:items-end">
        <Campo etiqueta="Producto, marca o SKU" name="q" defaultValue={q} placeholder="Ej: medias, Salomon, 1203" />
        <Selector etiqueta="Categoría" name="categoria" defaultValue={categoria}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.categoria}>{c.categoria}</option>
          ))}
        </Selector>
        <Boton type="submit">Filtrar</Boton>
      </form>

      <details className="rounded-lg border-2 border-neutral-400 p-3">
        <summary className="flex min-h-12 cursor-pointer items-center font-bold">¿El stock no cuadra? Verificalo contra los movimientos</summary>
        <p className="my-2 text-sm">
          El stock de cada ubicación es la suma de sus movimientos. Esta pantalla lee una copia para ser rápida; si alguna vez no coincide,
          se reconstruye desde los movimientos, que nunca se borran ni se editan.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Formulario accion={verificarStockAccion}>
            <BotonEnviar variante="secundario">Verificar</BotonEnviar>
          </Formulario>
          <Formulario accion={recalcularStockAccion}>
            <BotonEnviar variante="secundario">Recalcular desde los movimientos</BotonEnviar>
          </Formulario>
        </div>
      </details>

      {filas.length === 0 ? (
        <Vacio titulo="No hay productos que coincidan">Probá con otra palabra o elegí “Todas” en categoría.</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-black">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2">Producto</th>
                <th className="p-2">Talle</th>
                <th className="p-2">Color</th>
                <th className="p-2">SKU</th>
                {columnas.map((c) => (
                  <th key={c.id} className="p-2 text-right">
                    {c.nombre}
                  </th>
                ))}
                <th className="p-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const valores = columnas.map((c) => cantidad.get(`${f.id}-${c.id}`) ?? 0);
                return (
                  <tr key={f.id} className={`border-t border-neutral-300 ${f.activo ? "" : "text-neutral-500"}`}>
                    <td className="p-2">
                      <span className="font-bold">{f.producto}</span> <span className="text-neutral-600">{f.marca}</span>
                      {!f.activo && <span className="ml-2 text-xs font-bold uppercase">inactiva</span>}
                    </td>
                    <td className="p-2">{f.talle}</td>
                    <td className="p-2">{f.color}</td>
                    <td className="p-2 font-mono">{f.sku}</td>
                    {valores.map((v, i) => (
                      <td key={columnas[i]?.id} className={`p-2 text-right tabular-nums ${claseCantidad(v)}`}>
                        {v}
                      </td>
                    ))}
                    <td className="p-2 text-right font-bold tabular-nums">{valores.reduce((a, b) => a + b, 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Negativo: dos celulares vendieron la misma unidad. Se resuelve en el cierre del evento.
function claseCantidad(valor: number) {
  if (valor < 0) return "font-black text-red-700";
  if (valor === 0) return "text-neutral-400";
  return "";
}
