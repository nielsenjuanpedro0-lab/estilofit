import Link from "next/link";
import { z } from "zod";
import { pesos, rangoDeFechas, TIPO_UBICACION } from "@/componentes/formato";
import { Boton, Campo, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Indicador, Selector, Tarjeta, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { resumenDeEventos } from "@/servidor/eventos";
import {
  eventosParaFiltro,
  filtroDeEventosParaResumen,
  rankingDeProductos,
  rankingDeTallesPorCategoria,
  rankingDeVendedores,
  stockPorUbicacion,
  type Filtro,
} from "@/servidor/reportes";

// Lo que viene en la URL es texto de afuera: se valida y lo inválido se ignora.
const Parametros = z.object({
  evento: z.coerce.number().int().positive().optional().catch(undefined),
  desde: z.iso.date().optional().catch(undefined),
  hasta: z.iso.date().optional().catch(undefined),
  producto: z.string().max(100).optional().catch(undefined),
});

function Barra({ valor, maximo }: { valor: number; maximo: number }) {
  return (
    <div className="h-3 w-full rounded-full bg-neutral-200" aria-hidden>
      <div className="h-3 rounded-full bg-black" style={{ width: `${maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0}%` }} />
    </div>
  );
}

export default async function Reportes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await paginaConPermiso("ver");
  const parametros = Parametros.parse(await searchParams);
  const filtro: Filtro = { eventoId: parametros.evento, desde: parametros.desde, hasta: parametros.hasta };
  const texto = parametros.producto ?? "";

  const [opciones, porEvento, ranking, talles, vendedores, stock] = await Promise.all([
    eventosParaFiltro(),
    resumenDeEventos(filtroDeEventosParaResumen(filtro)),
    rankingDeProductos(filtro),
    rankingDeTallesPorCategoria(filtro),
    rankingDeVendedores(filtro),
    stockPorUbicacion(texto),
  ]);
  const conVentas = porEvento.filter((e) => e.ventas > 0);
  const total = conVentas.reduce(
    (t, e) => ({ ventas: t.ventas + e.ventas, unidades: t.unidades + e.vendidas, facturado: t.facturado + e.facturado }),
    { ventas: 0, unidades: 0, facturado: 0 },
  );
  const maximoRanking = ranking[0]?.unidades ?? 0;
  const maximoVendedor = Math.max(0, ...vendedores.map((v) => v.facturado));

  return (
    <>
      <EncabezadoDePagina titulo="Reportes" descripcion="El período se toma por la fecha del evento: el reloj de los celulares puede estar corrido." />

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-[1fr_11rem_11rem_auto] md:items-end">
        <Selector etiqueta="Evento" name="evento" defaultValue={parametros.evento ?? ""}>
          <option value="">Todos</option>
          {opciones.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nombre} · {o.fechaDesde}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Eventos desde" name="desde" type="date" defaultValue={parametros.desde} />
        <Campo etiqueta="Eventos hasta" name="hasta" type="date" defaultValue={parametros.hasta} />
        <div className="flex gap-2">
          <Boton type="submit">Filtrar</Boton>
          <EnlaceBoton href="/panel/reportes">Limpiar</EnlaceBoton>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="Eventos con ventas" valor={conVentas.length} />
        <Indicador titulo="Ventas" valor={total.ventas.toLocaleString("es-AR")} />
        <Indicador titulo="Facturado" valor={pesos(total.facturado)} />
        <Indicador titulo="Ticket promedio" valor={pesos(total.ventas > 0 ? total.facturado / total.ventas : 0)} detalle={`${total.unidades} unidades`} />
      </div>

      <Tarjeta titulo="Ventas por evento">
        {conVentas.length === 0 ? (
          <Vacio titulo="No hay ventas con este filtro">Elegí “Todos” en evento o ampliá las fechas.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fechas</th>
                  <th className="numero">Ventas</th>
                  <th className="numero">Unidades</th>
                  <th className="numero">Facturado</th>
                  <th className="numero">Ticket promedio</th>
                </tr>
              </thead>
              <tbody>
                {conVentas.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/panel/eventos/${e.id}`} className="font-bold hover:underline">
                        {e.nombre}
                      </Link>
                    </td>
                    <td>{rangoDeFechas(e.fechaDesde, e.fechaHasta)}</td>
                    <td className="numero">{e.ventas}</td>
                    <td className="numero">{e.vendidas}</td>
                    <td className="numero">{pesos(e.facturado)}</td>
                    <td className="numero">{pesos(e.facturado / e.ventas)}</td>
                  </tr>
                ))}
              </tbody>
              {conVentas.length > 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>Total</td>
                    <td className="numero">{total.ventas}</td>
                    <td className="numero">{total.unidades}</td>
                    <td className="numero">{pesos(total.facturado)}</td>
                    <td className="numero">{pesos(total.facturado / total.ventas)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </ContenedorTabla>
        )}
      </Tarjeta>

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Productos más vendidos" descripcion="Importe a precio de lista. Lo cobrado, con redondeos en efectivo, está en ventas por evento.">
          {ranking.length === 0 ? (
            <Vacio titulo="Sin ventas para rankear">Cuando un celular suba ventas de un evento, aparecen acá.</Vacio>
          ) : (
            <ol className="flex flex-col gap-3">
              {ranking.map((p, i) => (
                <li key={p.productoId} className="grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="row-span-2 text-xl font-black tabular-nums">{i + 1}</span>
                  <Link href={`/panel/catalogo/${p.productoId}`} className="truncate hover:underline">
                    <span className="font-bold">{p.producto}</span> <span className="text-neutral-600">{p.marca}</span>
                  </Link>
                  <span className="text-right font-black tabular-nums">{p.unidades} u.</span>
                  <Barra valor={p.unidades} maximo={maximoRanking} />
                  <span className="text-right text-sm tabular-nums">{pesos(p.importe)}</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>

        <Tarjeta titulo="Vendedores" descripcion="Lo que vendió cada uno con su PIN en el celular.">
          {vendedores.length === 0 ? (
            <Vacio titulo="Sin ventas con este filtro">Cuando haya ventas, aparece quién vendió qué.</Vacio>
          ) : (
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    <th className="numero">Ventas</th>
                    <th className="numero">Unidades</th>
                    <th className="numero">Facturado</th>
                    <th className="numero">Ticket</th>
                    <th className="w-32" />
                  </tr>
                </thead>
                <tbody>
                  {vendedores.map((v) => (
                    <tr key={v.usuarioId ?? "sin"}>
                      <td className="font-bold">{v.vendedor ?? <span className="text-neutral-500">Sin vendedor</span>}</td>
                      <td className="numero">{v.ventas}</td>
                      <td className="numero">{v.unidades}</td>
                      <td className="numero font-bold">{pesos(v.facturado)}</td>
                      <td className="numero">{pesos(v.ticket)}</td>
                      <td>
                        <Barra valor={v.facturado} maximo={maximoVendedor} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          )}
        </Tarjeta>
      </div>

      <Tarjeta titulo="Talles más vendidos por categoría">
        {talles.length === 0 ? (
          <Vacio titulo="Sin ventas para analizar talles">Cuando haya ventas con este filtro, aparecen acá.</Vacio>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {talles.map((c) => {
              const maximo = c.talles[0]?.unidades ?? 0;
              return (
                <div key={c.categoria} className="rounded-xl border-2 border-black p-3">
                  <p className="mb-2 flex justify-between font-black">
                    {c.categoria} <span className="text-sm font-normal">{c.total} u.</span>
                  </p>
                  <ul className="flex flex-col gap-1">
                    {c.talles.map((t) => (
                      <li key={t.talle} className="grid grid-cols-[4.5rem_1fr_2.5rem] items-center gap-2">
                        <span className="font-bold">{t.talle}</span>
                        <Barra valor={t.unidades} maximo={maximo} />
                        <span className="text-right tabular-nums">{t.unidades}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Tarjeta>

      <Tarjeta titulo="Stock actual por ubicación" acciones={<EnlaceBoton href="/panel/stock">Ver el detalle por variante</EnlaceBoton>}>
        <form className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {parametros.evento && <input type="hidden" name="evento" value={parametros.evento} />}
          {parametros.desde && <input type="hidden" name="desde" value={parametros.desde} />}
          {parametros.hasta && <input type="hidden" name="hasta" value={parametros.hasta} />}
          <Campo etiqueta="Producto, marca o SKU" name="producto" defaultValue={texto} placeholder="Ej: medias" />
          <Boton type="submit">Filtrar stock</Boton>
        </form>
        {stock.length === 0 ? (
          <Vacio titulo="No hay stock que coincida">Probá con otra palabra.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Ubicación</th>
                  <th>Tipo</th>
                  <th className="numero">Unidades</th>
                  <th className="numero">Variantes con stock</th>
                  <th className="numero">Valor a precio de lista</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((u) => (
                  <tr key={u.ubicacionId}>
                    <td className="font-bold">{u.ubicacion}</td>
                    <td>{TIPO_UBICACION[u.tipo]}</td>
                    <td className={`numero ${u.unidades < 0 ? "font-black text-red-700" : ""}`}>{u.unidades}</td>
                    <td className="numero">{u.variantesConStock}</td>
                    <td className="numero">{pesos(u.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        )}
      </Tarjeta>
    </>
  );
}
