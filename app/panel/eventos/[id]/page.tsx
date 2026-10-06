import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { abrirEventoAccion, cargarViaje } from "@/app/panel/acciones";
import { ElegirStock } from "@/app/panel/elegir-stock";
import { db } from "@/db/conexion";
import { eventos, ubicaciones } from "@/db/esquema";
import { ESTADO_EVENTO, MEDIO_DE_PAGO, momento, pesos, rangoDeFechas } from "@/componentes/formato";
import { Aviso, Boton, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Indicador, Insignia, Selector, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { asientosDelCierre } from "@/servidor/cierre";
import { resumenDeEventos, ventasDelEvento } from "@/servidor/eventos";
import { stockConNombres } from "@/servidor/transferencias";

const TONO_DE_ESTADO = { preparacion: "alerta", abierto: "bueno", cerrado: "neutro" } as const;

export default async function DetalleDeEvento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origen?: string; vista?: string }>;
}) {
  const yo = await paginaConPermiso("ver");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [evento] = await resumenDeEventos(eq(eventos.id, id));
  if (!evento) notFound();
  const { origen: origenPedido, vista: vistaPedida } = await searchParams;

  const opera = puede(yo.rol, "operar");
  const puedeCargar = opera && evento.estado !== "cerrado";
  const vistas = [
    { clave: "resumen", nombre: "Resumen" },
    ...(puedeCargar ? [{ clave: "viaje", nombre: "Cargar el viaje" }] : []),
    { clave: "ventas", nombre: `Ventas (${evento.ventas})` },
  ];
  const vista = vistas.some((v) => v.clave === vistaPedida) ? vistaPedida : "resumen";

  const enEvento = (await stockConNombres(evento.ubicacionId)).filter((s) => s.cantidad !== 0);
  const totalEnEvento = enEvento.reduce((suma, s) => suma + s.cantidad, 0);
  const listaDeVentas = await ventasDelEvento(evento.id);
  const paraRevisar = listaDeVentas.filter((v) => v.paraRevisar && !v.revisadaAt);
  const asientos = evento.estado === "cerrado" ? await asientosDelCierre(evento.id) : [];

  const origenes = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.activa, true), inArray(ubicaciones.tipo, ["deposito", "showroom"])))
    .orderBy(asc(ubicaciones.id));
  const origen = origenes.find((o) => o.id === Number(origenPedido)) ?? origenes[0];
  const disponibles =
    vista !== "viaje" || !origen
      ? []
      : (await stockConNombres(origen.id)).filter((s) => s.cantidad > 0).map(({ cantidad, ...resto }) => ({ ...resto, disponible: cantidad }));

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/eventos", nombre: "Eventos" }]}
        titulo={evento.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia tono={TONO_DE_ESTADO[evento.estado]}>{ESTADO_EVENTO[evento.estado]}</Insignia>
            {evento.lugar} · {rangoDeFechas(evento.fechaDesde, evento.fechaHasta)}
          </span>
        }
        acciones={
          opera &&
          evento.estado !== "cerrado" && (
            <>
              {evento.estado === "preparacion" && (
                <form action={abrirEventoAccion.bind(null, evento.id)}>
                  <Boton variante="secundario">Marcar como abierto</Boton>
                </form>
              )}
              <EnlaceBoton href={`/panel/eventos/${evento.id}/cierre`} variante="primario">
                Cerrar evento
              </EnlaceBoton>
            </>
          )
        }
      />

      <nav aria-label="Vistas del evento" className="flex gap-1 border-b-2 border-black">
        {vistas.map((v) => (
          <Link
            key={v.clave}
            href={`/panel/eventos/${evento.id}${v.clave === "resumen" ? "" : `?vista=${v.clave}`}`}
            aria-current={vista === v.clave ? "page" : undefined}
            className={`-mb-0.5 rounded-t-lg border-2 px-4 py-2 font-bold ${vista === v.clave ? "border-black border-b-neutral-100 bg-neutral-100" : "border-transparent hover:bg-white"}`}
          >
            {v.nombre}
          </Link>
        ))}
      </nav>

      {vista === "resumen" && (
        <>
          {evento.estado === "cerrado" ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Indicador titulo="Salieron" valor={evento.llevadas} />
              <Indicador titulo="Vendidas" valor={evento.vendidas} detalle={`en ${evento.ventas} ventas`} />
              <Indicador titulo="Facturado" valor={pesos(evento.facturado)} detalle={evento.ventas > 0 ? `ticket promedio ${pesos(evento.facturado / evento.ventas)}` : undefined} />
              <Indicador titulo="Devueltas" valor={evento.devueltas} />
              <Indicador titulo="Faltante real" valor={evento.faltantes} tono={evento.faltantes > 0 ? "malo" : "bueno"} />
              <Indicador titulo="Ventas no registradas" valor={evento.ventasNoRegistradas} tono={evento.ventasNoRegistradas > 0 ? "alerta" : "bueno"} />
              <Indicador titulo="Sobrantes" valor={evento.sobrantes} tono={evento.sobrantes > 0 ? "alerta" : "bueno"} />
              <Indicador titulo="Cerrado" valor={evento.cerradoAt ? momento(evento.cerradoAt) : "—"} detalle={`${asientos.length} ajustes asentados`} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
              <Indicador titulo="Llevadas" valor={evento.llevadas} />
              <Indicador titulo="Vendidas" valor={evento.vendidas} />
              <Indicador titulo="Ventas" valor={evento.ventas} />
              <Indicador titulo="Facturado" valor={pesos(evento.facturado)} />
              <Indicador titulo="En el evento ahora" valor={totalEnEvento} />
            </div>
          )}

          {paraRevisar.length > 0 && (
            <Aviso tono="atencion">
              <p className="font-bold">{paraRevisar.length} ventas para revisar. Entraron igual porque la plata ya se cobró:</p>
              <ul className="mt-2 list-disc pl-5">
                {paraRevisar.map((v) => (
                  <li key={v.id}>
                    <Link href={`/panel/ventas/${v.id}`} className="underline">
                      Venta #{v.id}
                    </Link>{" "}
                    · cobrado {pesos(v.total)} · catálogo {pesos(v.totalCatalogo)} · {v.motivoRevision}
                  </li>
                ))}
              </ul>
            </Aviso>
          )}

          {asientos.length > 0 && (
            <Tarjeta titulo="Ajustes del cierre" descripcion="Las diferencias del conteo, asentadas con fecha. Nada se pisó.">
              <ContenedorTabla>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Talle</th>
                      <th>Color</th>
                      <th className="numero">Unidades</th>
                      <th>Asiento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asientos.map((a) => (
                      <tr key={a.id}>
                        <td className="font-bold">{a.producto}</td>
                        <td>{a.talle}</td>
                        <td>{a.color}</td>
                        <td className={`numero font-black ${a.entra ? "text-sky-800" : "text-red-700"}`}>{a.entra ? `+${a.cantidad}` : `−${a.cantidad}`}</td>
                        <td>{a.nota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ContenedorTabla>
            </Tarjeta>
          )}

          <Tarjeta titulo="Stock en el evento">
            {enEvento.length === 0 ? (
              <Vacio titulo={evento.estado === "cerrado" ? "El evento está cerrado y su stock volvió" : "Todavía no se cargó nada"}>
                {evento.estado === "cerrado" ? "Mirá los ajustes del cierre más arriba." : "Cargá el viaje desde la pestaña “Cargar el viaje”."}
              </Vacio>
            ) : (
              <ContenedorTabla>
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Talle</th>
                      <th>Color</th>
                      <th>SKU</th>
                      <th className="numero">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enEvento.map((s) => (
                      <tr key={s.varianteId}>
                        <td className="font-bold">{s.producto}</td>
                        <td>{s.talle}</td>
                        <td>{s.color}</td>
                        <td className="font-mono">{s.sku}</td>
                        <td className={`numero ${s.cantidad < 0 ? "font-black text-red-700" : ""}`}>{s.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4}>Total</td>
                      <td className="numero">{totalEnEvento}</td>
                    </tr>
                  </tfoot>
                </table>
              </ContenedorTabla>
            )}
          </Tarjeta>
        </>
      )}

      {vista === "viaje" && puedeCargar && (
        <Tarjeta titulo="Cargar el viaje" descripcion="Elegí de dónde sale la mercadería, qué variantes y cuántas. Nada se mueve hasta confirmar.">
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <input type="hidden" name="vista" value="viaje" />
            <Selector etiqueta="Sale de" name="origen" defaultValue={origen?.id}>
              {origenes.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </Selector>
            <Boton variante="secundario" type="submit">
              Cambiar origen
            </Boton>
          </form>
          {origen && disponibles.length > 0 ? (
            <ElegirStock key={origen.id} disponibles={disponibles} mover={cargarViaje.bind(null, evento.id, origen.id)} destino={evento.nombre} />
          ) : (
            <Vacio titulo={`No hay stock en ${origen?.nombre ?? "ninguna ubicación"}`}>Ingresá mercadería desde Catálogo o elegí otro origen.</Vacio>
          )}
        </Tarjeta>
      )}

      {vista === "ventas" &&
        (listaDeVentas.length === 0 ? (
          <Vacio titulo="Todavía no llegó ninguna venta">Las ventas aparecen acá cuando un celular del evento las sube.</Vacio>
        ) : (
          <>
            <p className="text-sm text-neutral-700">
              Ordenadas por la hora en que llegaron al servidor. La hora del celular se muestra al lado, pero no ordena: los relojes pueden
              estar corridos.{" "}
              <Link href={`/panel/ventas?evento=${evento.id}`} className="font-bold underline">
                Ver en Ventas con filtros
              </Link>
            </p>
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Llegó</th>
                    <th>Hora del celular</th>
                    <th>Vendedor</th>
                    <th>Celular</th>
                    <th>Detalle</th>
                    <th>Medio</th>
                    <th className="numero">Cobrado</th>
                    <th className="numero">Catálogo</th>
                  </tr>
                </thead>
                <tbody>
                  {listaDeVentas.map((v) => (
                    <tr key={v.id} className={v.paraRevisar && !v.revisadaAt ? "bg-amber-50" : ""}>
                      <td>
                        <Link href={`/panel/ventas/${v.id}`} className="font-black underline">
                          #{v.id}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{momento(v.recibidoAt)}</td>
                      <td className="whitespace-nowrap text-neutral-600">{momento(v.vendidoAt)}</td>
                      <td>{v.vendedor ?? <span className="text-neutral-500">Sin vendedor</span>}</td>
                      <td>{v.celular}</td>
                      <td>
                        {v.detalle}
                        {v.paraRevisar && !v.revisadaAt && <span className="mt-1 block font-bold text-amber-900">Para revisar: {v.motivoRevision}</span>}
                      </td>
                      <td>{MEDIO_DE_PAGO[v.medioPago]}</td>
                      <td className="numero font-bold">{pesos(v.total)}</td>
                      <td className={`numero ${v.total === v.totalCatalogo ? "text-neutral-500" : ""}`}>{pesos(v.totalCatalogo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          </>
        ))}
    </>
  );
}
