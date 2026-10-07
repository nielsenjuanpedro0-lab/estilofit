import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db/conexion";
import { proveedores } from "@/db/esquema";
import { pesos, rangoDeFechas } from "@/componentes/formato";
import { Boton, Campo, ColumnaOrdenable, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Indicador, Insignia, Paginacion, Selector, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { listarCompras } from "@/servidor/compras";
import { POR_PAGINA, comoConsulta, parametrosPlanos, type ParametrosDeListado } from "@/servidor/listados";

export default async function Compras({ searchParams }: { searchParams: Promise<ParametrosDeListado> }) {
  const yo = await paginaConPermiso("ver");
  const parametros = await searchParams;
  const p = parametrosPlanos(parametros);
  const [listado, todos] = await Promise.all([
    listarCompras(parametros),
    db().select({ id: proveedores.id, nombre: proveedores.nombre }).from(proveedores).orderBy(asc(proveedores.nombre)),
  ]);
  const filtrado = Object.entries(p).some(([clave, valor]) => valor && !["orden", "dir", "pagina"].includes(clave));
  const enPantalla = listado.filas.filter((c) => !c.anulada);

  return (
    <>
      <EncabezadoDePagina
        titulo="Compras"
        descripcion="Mercadería que entra de proveedores. Cada compra suma stock en el destino y actualiza el costo de cada variante, salvo que ya haya una compra con fecha posterior."
        acciones={
          <>
            <EnlaceBoton href={`/panel/exportar/compras${comoConsulta(p)}`}>Exportar CSV</EnlaceBoton>
            {puede(yo.rol, "operar") && (
              <EnlaceBoton href="/panel/compras/nueva" variante="primario">
                + Nueva compra
              </EnlaceBoton>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Indicador titulo="Compras" valor={listado.total.toLocaleString("es-AR")} detalle={filtrado ? "Con los filtros aplicados" : "Todas"} />
        <Indicador titulo="Unidades en esta página" valor={enPantalla.reduce((s, c) => s + c.unidades, 0)} detalle="Sin las anuladas" />
        <Indicador titulo="A costo en esta página" valor={pesos(enPantalla.reduce((s, c) => s + c.total, 0))} detalle="Sin las anuladas" />
      </div>

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-3 md:items-end 2xl:grid-cols-6">
        <Campo etiqueta="Número o comprobante" name="q" defaultValue={p.q} placeholder="Ej: 12 o 0001-0000" />
        <Selector etiqueta="Proveedor" name="proveedor" defaultValue={p.proveedor ?? ""}>
          <option value="">Todos</option>
          {todos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Estado" name="estado" defaultValue={p.estado ?? ""}>
          <option value="">Todas</option>
          <option value="vigentes">Vigentes</option>
          <option value="anuladas">Anuladas</option>
        </Selector>
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={p.desde} />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={p.hasta} />
        <div className="flex gap-2">
          <Boton type="submit">Filtrar</Boton>
          {filtrado && <EnlaceBoton href="/panel/compras">Limpiar</EnlaceBoton>}
        </div>
      </form>

      {listado.filas.length === 0 ? (
        <Vacio titulo="No hay compras con estos filtros">{filtrado ? "Probá sacando algún filtro." : "Cargá la primera con “Nueva compra”."}</Vacio>
      ) : (
        <>
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <ColumnaOrdenable campo="numero" ruta="/panel/compras" parametros={p}>
                    N.º
                  </ColumnaOrdenable>
                  <ColumnaOrdenable campo="fecha" ruta="/panel/compras" parametros={p}>
                    Fecha
                  </ColumnaOrdenable>
                  <th>Proveedor</th>
                  <th>Comprobante</th>
                  <th>Destino</th>
                  <th className="numero">Unid.</th>
                  <th className="numero">Total a costo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {listado.filas.map((c) => (
                  <tr key={c.id} className={c.anulada ? "text-neutral-500" : ""}>
                    <td>
                      <Link href={`/panel/compras/${c.id}`} className="font-black underline">
                        #{c.id}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{rangoDeFechas(c.fecha, c.fecha)}</td>
                    <td>
                      <Link href={`/panel/proveedores/${c.proveedorId}`} className="hover:underline">
                        {c.proveedor}
                      </Link>
                    </td>
                    <td>{c.comprobante ?? "—"}</td>
                    <td>{c.destino}</td>
                    <td className="numero">{c.unidades}</td>
                    <td className="numero font-bold">{pesos(c.total)}</td>
                    <td>{c.anulada ? <Insignia tono="malo">Anulada</Insignia> : <Insignia tono="bueno">Vigente</Insignia>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion ruta="/panel/compras" parametros={p} pagina={listado.pagina} porPagina={POR_PAGINA} total={listado.total} />
        </>
      )}
    </>
  );
}
