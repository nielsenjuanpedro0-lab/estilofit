import Link from "next/link";
import { recalcularStockAccion, verificarStockAccion } from "@/app/panel/acciones";
import { TIPO_UBICACION, pesos } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Formulario, Indicador, Selector, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { comoConsulta } from "@/servidor/listados";
import { categorias, matrizDeStock, ubicacionesConStock } from "@/servidor/stock";

type Filtros = { q?: string; categoria?: string; ubicacion?: string };

// Negativo: dos celulares vendieron la misma unidad. Se resuelve en el cierre del evento.
function claseCantidad(valor: number) {
  if (valor < 0) return "font-black text-red-700";
  if (valor === 0) return "text-neutral-400";
  return "";
}

export default async function Stock({ searchParams }: { searchParams: Promise<Filtros> }) {
  const yo = await paginaConPermiso("ver");
  const filtro = await searchParams;
  const ubicacion = Number(filtro.ubicacion);
  const [{ columnas, filas, totales }, listaDeCategorias, todas] = await Promise.all([
    matrizDeStock({ q: filtro.q, categoria: filtro.categoria, ubicacion: Number.isInteger(ubicacion) && ubicacion > 0 ? ubicacion : undefined }),
    categorias(),
    ubicacionesConStock(),
  ]);
  const unidades = filas.reduce((s, f) => s + f.total, 0);
  const valor = filas.reduce((s, f) => s + f.total * f.precio, 0);
  const sinStock = filas.filter((f) => f.total <= 0 && f.activo).length;

  return (
    <>
      <EncabezadoDePagina
        titulo="Stock"
        descripcion="Stock actual de cada variante en cada ubicación. Es la suma de los movimientos del libro mayor."
        acciones={
          <>
            <EnlaceBoton href={`/panel/exportar/stock${comoConsulta(filtro)}`}>Exportar CSV</EnlaceBoton>
            {puede(yo.rol, "operar") && (
              <EnlaceBoton href="/panel/transferencias" variante="destacado">
                Transferir
              </EnlaceBoton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Unidades" valor={unidades.toLocaleString("es-AR")} detalle={filtro.q || filtro.categoria || filtro.ubicacion ? "Con los filtros aplicados" : "En todas las ubicaciones"} />
        <Indicador titulo="Valor a precio de lista" valor={pesos(valor)} />
        <Indicador titulo="Variantes" valor={filas.length} detalle={`${columnas.length} ubicaciones`} />
        <Indicador titulo="Activas sin stock" valor={sinStock} tono={sinStock > 0 ? "alerta" : "bueno"} />
      </div>

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-[1fr_14rem_14rem_auto] md:items-end">
        <Campo etiqueta="Producto, marca o SKU" name="q" defaultValue={filtro.q} placeholder="Ej: medias, Salomon, 1203" />
        <Selector etiqueta="Categoría" name="categoria" defaultValue={filtro.categoria ?? ""}>
          <option value="">Todas</option>
          {listaDeCategorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Selector>
        <Selector etiqueta="Ubicación" name="ubicacion" defaultValue={filtro.ubicacion ?? ""}>
          <option value="">Todas</option>
          {todas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <div className="flex gap-2">
          <Boton type="submit">Filtrar</Boton>
          <EnlaceBoton href="/panel/stock">Limpiar</EnlaceBoton>
        </div>
      </form>

      {filas.length === 0 ? (
        <Vacio titulo="No hay productos que coincidan">Probá con otra palabra o elegí “Todas” en categoría y ubicación.</Vacio>
      ) : (
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Talle</th>
                <th>Color</th>
                <th>SKU</th>
                {columnas.map((c) => (
                  <th key={c.id} className="numero" title={TIPO_UBICACION[c.tipo]}>
                    {c.nombre}
                  </th>
                ))}
                <th className="numero">Total</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.id} className={f.activo ? "" : "text-neutral-500"}>
                  <td>
                    <Link href={`/panel/catalogo/${f.productoId}`} className="font-bold hover:underline">
                      {f.producto}
                    </Link>{" "}
                    <span className="text-neutral-600">{f.marca}</span>
                    {!f.activo && <span className="ml-2 text-xs font-bold uppercase">inactiva</span>}
                  </td>
                  <td className="font-bold">{f.talle}</td>
                  <td>{f.color}</td>
                  <td className="font-mono">{f.sku}</td>
                  {f.porUbicacion.map((v, i) => (
                    <td key={columnas[i]?.id} className={`numero ${claseCantidad(v)}`}>
                      {v}
                    </td>
                  ))}
                  <td className={`numero font-black ${claseCantidad(f.total)}`}>{f.total}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>Total</td>
                {totales.map((t, i) => (
                  <td key={columnas[i]?.id} className="numero">
                    {t}
                  </td>
                ))}
                <td className="numero">{unidades}</td>
              </tr>
            </tfoot>
          </table>
        </ContenedorTabla>
      )}

      <Tarjeta
        titulo="¿El stock no cuadra?"
        descripcion="Esta pantalla lee una copia del libro mayor para ser rápida. Si alguna vez no coincide, se reconstruye desde los movimientos, que nunca se borran ni se editan."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Formulario accion={verificarStockAccion}>
            <BotonEnviar variante="secundario">Verificar contra los movimientos</BotonEnviar>
          </Formulario>
          {puede(yo.rol, "administrar") && (
            <Formulario accion={recalcularStockAccion}>
              <BotonEnviar variante="secundario">Recalcular desde los movimientos</BotonEnviar>
            </Formulario>
          )}
        </div>
      </Tarjeta>
    </>
  );
}
