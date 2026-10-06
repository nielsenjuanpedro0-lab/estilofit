import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, eventos, usuarios } from "@/db/esquema";
import { MEDIO_DE_PAGO, momento, pesos } from "@/componentes/formato";
import {
  Boton,
  Campo,
  ColumnaOrdenable,
  ContenedorTabla,
  EncabezadoDePagina,
  EnlaceBoton,
  Indicador,
  Insignia,
  Paginacion,
  Selector,
  Vacio,
} from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { POR_PAGINA, comoConsulta, parametrosPlanos, type ParametrosDeListado } from "@/servidor/listados";
import { listarVentas } from "@/servidor/ventas";

export default async function Ventas({ searchParams }: { searchParams: Promise<ParametrosDeListado> }) {
  await paginaConPermiso("ver");
  const parametros = await searchParams;
  const p = parametrosPlanos(parametros);
  const [listado, listaDeEventos, personas, celulares] = await Promise.all([
    listarVentas(parametros),
    db().select({ id: eventos.id, nombre: eventos.nombre, fechaDesde: eventos.fechaDesde }).from(eventos).orderBy(desc(eventos.fechaDesde)),
    db().select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).orderBy(asc(usuarios.nombre)),
    db().select({ id: dispositivos.id, nombre: dispositivos.nombre }).from(dispositivos).orderBy(asc(dispositivos.nombre)),
  ]);
  const filtrado = Object.entries(p).some(([clave, valor]) => valor && !["orden", "dir", "pagina"].includes(clave));

  return (
    <>
      <EncabezadoDePagina
        titulo="Ventas"
        descripcion="Todas las ventas de todos los eventos, en el orden en que llegaron al servidor. La hora del celular se muestra, pero no ordena: los relojes pueden estar corridos."
        acciones={<EnlaceBoton href={`/panel/exportar/ventas${comoConsulta(p)}`}>Exportar CSV</EnlaceBoton>}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Ventas" valor={listado.total.toLocaleString("es-AR")} detalle={filtrado ? "Con los filtros aplicados" : "Todas"} />
        <Indicador titulo="Cobrado" valor={pesos(listado.facturado)} />
        <Indicador titulo="Unidades" valor={listado.unidades.toLocaleString("es-AR")} />
        <Indicador titulo="Ticket promedio" valor={pesos(listado.total > 0 ? listado.facturado / listado.total : 0)} />
      </div>

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-4 xl:grid-cols-8 xl:items-end">
        <Campo etiqueta="Número o código" name="q" defaultValue={p.q} placeholder="Ej: 1520 o 3f9a…" />
        <Selector etiqueta="Evento" name="evento" defaultValue={p.evento ?? ""}>
          <option value="">Todos</option>
          {listaDeEventos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre} · {e.fechaDesde}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Vendedor" name="vendedor" defaultValue={p.vendedor ?? ""}>
          <option value="">Todos</option>
          {personas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Celular" name="celular" defaultValue={p.celular ?? ""}>
          <option value="">Todos</option>
          {celulares.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Medio" name="medio" defaultValue={p.medio ?? ""}>
          <option value="">Todos</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="tarjeta">Tarjeta</option>
        </Selector>
        <Selector etiqueta="Estado" name="estado" defaultValue={p.estado ?? ""}>
          <option value="">Todas</option>
          <option value="revisar">Para revisar</option>
          <option value="revisadas">Revisadas</option>
        </Selector>
        <Campo etiqueta="Llegó desde" name="desde" type="date" defaultValue={p.desde} />
        <Campo etiqueta="Llegó hasta" name="hasta" type="date" defaultValue={p.hasta} />
        <div className="flex gap-2 md:col-span-4 xl:col-span-8">
          <Boton type="submit">Filtrar</Boton>
          {filtrado && <EnlaceBoton href="/panel/ventas">Limpiar filtros</EnlaceBoton>}
        </div>
      </form>

      {listado.filas.length === 0 ? (
        <Vacio titulo="No hay ventas con estos filtros">{filtrado ? "Probá sacando algún filtro." : "Las ventas aparecen cuando un celular las sube."}</Vacio>
      ) : (
        <>
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <ColumnaOrdenable campo="numero" ruta="/panel/ventas" parametros={p}>
                    N.º
                  </ColumnaOrdenable>
                  <ColumnaOrdenable campo="fecha" ruta="/panel/ventas" parametros={p}>
                    Llegó
                  </ColumnaOrdenable>
                  <th>Hora del celular</th>
                  <ColumnaOrdenable campo="evento" ruta="/panel/ventas" parametros={p}>
                    Evento
                  </ColumnaOrdenable>
                  <th>Vendedor</th>
                  <th>Celular</th>
                  <th>Medio</th>
                  <th className="numero">Unid.</th>
                  <ColumnaOrdenable campo="total" ruta="/panel/ventas" parametros={p} numero>
                    Cobrado
                  </ColumnaOrdenable>
                  <th className="numero">Catálogo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {listado.filas.map((v) => (
                  <tr key={v.id} className={v.paraRevisar && !v.revisadaAt ? "bg-amber-50" : ""}>
                    <td>
                      <Link href={`/panel/ventas/${v.id}`} className="font-black underline">
                        #{v.id}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{momento(v.recibidoAt)}</td>
                    <td className="whitespace-nowrap text-neutral-600">{momento(v.vendidoAt)}</td>
                    <td>
                      {v.eventoId ? (
                        <Link href={`/panel/eventos/${v.eventoId}`} className="hover:underline">
                          {v.evento}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{v.vendedor ?? <span className="text-neutral-500">Sin vendedor</span>}</td>
                    <td>{v.celular}</td>
                    <td>{MEDIO_DE_PAGO[v.medioPago]}</td>
                    <td className="numero">{v.unidades}</td>
                    <td className="numero font-bold">{pesos(v.total)}</td>
                    <td className={`numero ${v.total === v.totalCatalogo ? "text-neutral-500" : ""}`}>{pesos(v.totalCatalogo)}</td>
                    <td>
                      {v.paraRevisar ? (
                        v.revisadaAt ? (
                          <Insignia tono="info">Revisada</Insignia>
                        ) : (
                          <span title={v.motivoRevision ?? ""}>
                            <Insignia tono="alerta">Para revisar</Insignia>
                          </span>
                        )
                      ) : (
                        <Insignia tono="bueno">OK</Insignia>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion ruta="/panel/ventas" parametros={p} pagina={listado.pagina} porPagina={POR_PAGINA} total={listado.total} />
        </>
      )}
    </>
  );
}
