import { z } from "zod";
import { pesos, rangoDeFechas, TIPO_UBICACION } from "@/componentes/formato";
import { Boton, Campo, Selector, Vacio } from "@/componentes/primitivos";
import { resumenDeEventos } from "@/servidor/eventos";
import {
  eventosParaFiltro,
  filtroDeEventosParaResumen,
  rankingDeProductos,
  rankingDeTallesPorCategoria,
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
    <div className="h-4 w-full bg-neutral-200" aria-hidden>
      <div className="h-4 bg-black" style={{ width: `${maximo > 0 ? Math.max(2, (valor / maximo) * 100) : 0}%` }} />
    </div>
  );
}

export default async function Reportes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parametros = Parametros.parse(await searchParams);
  const filtro: Filtro = { eventoId: parametros.evento, desde: parametros.desde, hasta: parametros.hasta };
  const texto = parametros.producto ?? "";

  const [opciones, porEvento, ranking, talles, stock] = await Promise.all([
    eventosParaFiltro(),
    resumenDeEventos(filtroDeEventosParaResumen(filtro)),
    rankingDeProductos(filtro),
    rankingDeTallesPorCategoria(filtro),
    stockPorUbicacion(texto),
  ]);
  const conVentas = porEvento.filter((e) => e.ventas > 0);
  const total = conVentas.reduce(
    (t, e) => ({ ventas: t.ventas + e.ventas, unidades: t.unidades + e.vendidas, facturado: t.facturado + e.facturado }),
    { ventas: 0, unidades: 0, facturado: 0 },
  );
  const maximoRanking = ranking[0]?.unidades ?? 0;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-3xl font-black">Reportes</h1>

      <form className="grid gap-3 rounded-lg border-2 border-black p-4 sm:grid-cols-[1fr_11rem_11rem_auto] sm:items-end">
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
        <Boton type="submit">Filtrar</Boton>
        <p className="text-sm sm:col-span-4">El período se toma por la fecha del evento: el reloj de los celulares puede estar corrido.</p>
      </form>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-black">Ventas por evento</h2>
        {conVentas.length === 0 ? (
          <Vacio titulo="No hay ventas con este filtro">Elegí “Todos” en evento o ampliá las fechas.</Vacio>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-black">
            <table className="w-full border-collapse text-left">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="p-2">Evento</th>
                  <th className="p-2">Fechas</th>
                  <th className="p-2 text-right">Ventas</th>
                  <th className="p-2 text-right">Unidades</th>
                  <th className="p-2 text-right">Facturado</th>
                  <th className="p-2 text-right">Ticket promedio</th>
                </tr>
              </thead>
              <tbody>
                {conVentas.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-300">
                    <td className="p-2 font-bold">{e.nombre}</td>
                    <td className="p-2">{rangoDeFechas(e.fechaDesde, e.fechaHasta)}</td>
                    <td className="p-2 text-right tabular-nums">{e.ventas}</td>
                    <td className="p-2 text-right tabular-nums">{e.vendidas}</td>
                    <td className="p-2 text-right tabular-nums">{pesos(e.facturado)}</td>
                    <td className="p-2 text-right tabular-nums">{pesos(e.facturado / e.ventas)}</td>
                  </tr>
                ))}
              </tbody>
              {conVentas.length > 1 && (
                <tfoot className="border-t-2 border-black font-black">
                  <tr>
                    <td className="p-2" colSpan={2}>
                      Total
                    </td>
                    <td className="p-2 text-right tabular-nums">{total.ventas}</td>
                    <td className="p-2 text-right tabular-nums">{total.unidades}</td>
                    <td className="p-2 text-right tabular-nums">{pesos(total.facturado)}</td>
                    <td className="p-2 text-right tabular-nums">{pesos(total.facturado / total.ventas)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-black">Productos más vendidos</h2>
        {ranking.length === 0 ? (
          <Vacio titulo="Sin ventas para rankear">Cuando un celular suba ventas de un evento, aparecen acá.</Vacio>
        ) : (
          <ol className="flex flex-col gap-2">
            {ranking.map((p, i) => (
              <li key={p.productoId} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 gap-y-1 border-b border-neutral-300 pb-2">
                <span className="row-span-2 text-2xl font-black tabular-nums">{i + 1}</span>
                <span>
                  <span className="font-bold">{p.producto}</span> <span className="text-neutral-600">{p.marca} · {p.categoria}</span>
                </span>
                <span className="text-right font-black tabular-nums">{p.unidades} u.</span>
                <Barra valor={p.unidades} maximo={maximoRanking} />
                <span className="text-right text-sm tabular-nums">{pesos(p.importe)}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-sm">Importe a precio de lista. Lo cobrado, con redondeos en efectivo, está en ventas por evento.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-black">Talles más vendidos por categoría</h2>
        {talles.length === 0 ? (
          <Vacio titulo="Sin ventas para analizar talles">Cuando haya ventas con este filtro, aparecen acá.</Vacio>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {talles.map((c) => {
              const maximo = c.talles[0]?.unidades ?? 0;
              return (
                <div key={c.categoria} className="rounded-lg border-2 border-black p-3">
                  <p className="mb-2 text-lg font-black">
                    {c.categoria} <span className="text-sm font-normal">({c.total} u.)</span>
                  </p>
                  <ul className="flex flex-col gap-1">
                    {c.talles.map((t) => (
                      <li key={t.talle} className="grid grid-cols-[4rem_1fr_3rem] items-center gap-2">
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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-black">Stock actual por ubicación</h2>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          {parametros.evento && <input type="hidden" name="evento" value={parametros.evento} />}
          {parametros.desde && <input type="hidden" name="desde" value={parametros.desde} />}
          {parametros.hasta && <input type="hidden" name="hasta" value={parametros.hasta} />}
          <Campo etiqueta="Producto, marca o SKU" name="producto" defaultValue={texto} placeholder="Ej: medias" />
          <Boton type="submit">Filtrar stock</Boton>
        </form>
        {stock.length === 0 ? (
          <Vacio titulo="No hay stock que coincida">Probá con otra palabra. El detalle por variante está en Stock.</Vacio>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-black">
            <table className="w-full border-collapse text-left">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="p-2">Ubicación</th>
                  <th className="p-2">Tipo</th>
                  <th className="p-2 text-right">Unidades</th>
                  <th className="p-2 text-right">Variantes con stock</th>
                  <th className="p-2 text-right">Valor a precio de lista</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((u) => (
                  <tr key={u.ubicacionId} className="border-t border-neutral-300">
                    <td className="p-2 font-bold">{u.ubicacion}</td>
                    <td className="p-2">{TIPO_UBICACION[u.tipo]}</td>
                    <td className={`p-2 text-right tabular-nums ${u.unidades < 0 ? "font-black text-red-700" : ""}`}>{u.unidades}</td>
                    <td className="p-2 text-right tabular-nums">{u.variantesConStock}</td>
                    <td className="p-2 text-right tabular-nums">{pesos(u.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
