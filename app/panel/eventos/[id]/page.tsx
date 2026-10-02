import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { abrirEventoAccion, cargarViaje } from "@/app/panel/acciones";
import { ElegirStock } from "@/app/panel/elegir-stock";
import { db } from "@/db/conexion";
import { eventos, ubicaciones, ventas } from "@/db/esquema";
import { ESTADO_EVENTO, momento, pesos, rangoDeFechas } from "@/componentes/formato";
import { Aviso, Boton, Selector, Vacio } from "@/componentes/primitivos";
import { asientosDelCierre } from "@/servidor/cierre";
import { resumenDeEventos } from "@/servidor/eventos";
import { stockConNombres } from "@/servidor/transferencias";

export default async function DetalleDeEvento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ origen?: string }>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [evento] = await resumenDeEventos(eq(eventos.id, id));
  if (!evento) notFound();

  const origenes = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.activa, true), inArray(ubicaciones.tipo, ["deposito", "showroom"])))
    .orderBy(asc(ubicaciones.id));
  const pedido = Number((await searchParams).origen);
  const origen = origenes.find((o) => o.id === pedido) ?? origenes[0];

  const enEvento = (await stockConNombres(evento.ubicacionId)).filter((s) => s.cantidad !== 0);
  const disponibles =
    evento.estado === "cerrado" || !origen
      ? []
      : (await stockConNombres(origen.id))
          .filter((s) => s.cantidad > 0)
          .map(({ cantidad, ...resto }) => ({ ...resto, disponible: cantidad }));
  const paraRevisar = await db()
    .select()
    .from(ventas)
    .where(and(eq(ventas.eventoId, evento.id), eq(ventas.paraRevisar, true)))
    .orderBy(asc(ventas.recibidoAt));
  const totalEnEvento = enEvento.reduce((suma, s) => suma + s.cantidad, 0);
  const asientos = evento.estado === "cerrado" ? await asientosDelCierre(evento.id) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <Link href="/panel/eventos" className="text-sm underline">
            ← Eventos
          </Link>
          <h1 className="text-3xl font-black">{evento.nombre}</h1>
          <p className="text-lg">
            {evento.lugar} · {rangoDeFechas(evento.fechaDesde, evento.fechaHasta)} ·{" "}
            <span className="font-bold">{ESTADO_EVENTO[evento.estado]}</span>
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {evento.estado === "preparacion" && (
            <form action={abrirEventoAccion.bind(null, evento.id)}>
              <Boton variante="secundario">Marcar como abierto</Boton>
            </form>
          )}
          {evento.estado !== "cerrado" && (
            <Link href={`/panel/eventos/${evento.id}/cierre`} className="flex min-h-12 items-center rounded-lg border-2 border-black bg-black px-4 font-bold text-white">
              Cerrar evento
            </Link>
          )}
        </div>
      </div>

      {evento.estado === "cerrado" ? (
        <section className="flex flex-col gap-3 rounded-lg border-4 border-black p-4">
          <h2 className="text-2xl font-black">Resumen del cierre{evento.cerradoAt ? ` · ${momento(evento.cerradoAt)}` : ""}</h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Cifra titulo="Salieron" valor={evento.llevadas} />
            <Cifra titulo="Vendidas" valor={evento.vendidas} detalle={`en ${evento.ventas} ventas`} />
            <Cifra titulo="Facturado" valor={pesos(evento.facturado)} detalle={evento.ventas > 0 ? `ticket promedio ${pesos(evento.facturado / evento.ventas)}` : undefined} />
            <Cifra titulo="Devueltas" valor={evento.devueltas} />
            <Cifra titulo="Faltante real" valor={evento.faltantes} tono={evento.faltantes > 0 ? "rojo" : "neutro"} />
            <Cifra titulo="Ventas no registradas" valor={evento.ventasNoRegistradas} tono={evento.ventasNoRegistradas > 0 ? "rojo" : "neutro"} />
            <Cifra titulo="Sobrantes" valor={evento.sobrantes} tono={evento.sobrantes > 0 ? "azul" : "neutro"} />
            <Cifra titulo="Ajustes asentados" valor={asientos.length} />
          </dl>
          {asientos.length > 0 && (
            <div className="overflow-x-auto rounded-lg border-2 border-black">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-neutral-100">
                  <tr>
                    <th className="p-2">Producto</th>
                    <th className="p-2">Talle</th>
                    <th className="p-2">Color</th>
                    <th className="p-2 text-right">Unidades</th>
                    <th className="p-2">Asiento</th>
                  </tr>
                </thead>
                <tbody>
                  {asientos.map((a) => (
                    <tr key={a.id} className="border-t border-neutral-300">
                      <td className="p-2 font-bold">{a.producto}</td>
                      <td className="p-2">{a.talle}</td>
                      <td className="p-2">{a.color}</td>
                      <td className={`p-2 text-right font-black tabular-nums ${a.entra ? "text-sky-800" : "text-red-700"}`}>
                        {a.entra ? `+${a.cantidad}` : `−${a.cantidad}`}
                      </td>
                      <td className="p-2">{a.nota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Cifra titulo="Llevadas" valor={evento.llevadas} />
          <Cifra titulo="Vendidas" valor={evento.vendidas} />
          <Cifra titulo="Ventas" valor={evento.ventas} />
          <Cifra titulo="Facturado" valor={pesos(evento.facturado)} />
          <Cifra titulo="En el evento ahora" valor={totalEnEvento} />
        </dl>
      )}

      {paraRevisar.length > 0 && (
        <Aviso tono="atencion">
          <p className="font-bold">{paraRevisar.length} ventas para revisar. Entraron igual porque la plata ya se cobró:</p>
          <ul className="mt-2 list-disc pl-5">
            {paraRevisar.map((v) => (
              <li key={v.id}>
                {momento(v.recibidoAt)} · cobrado {pesos(v.total)} · catálogo {pesos(v.totalCatalogo)} · {v.motivoRevision}
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      {evento.estado !== "cerrado" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-2xl font-bold">Cargar el viaje</h2>
          <form className="flex flex-wrap items-end gap-3">
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
            <Vacio titulo={`No hay stock en ${origen?.nombre ?? "ninguna ubicación"}`}>
              Ingresá mercadería desde Catálogo o elegí otro origen.
            </Vacio>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Stock en el evento</h2>
        {enEvento.length === 0 ? (
          <Vacio titulo={evento.estado === "cerrado" ? "El evento está cerrado y su stock volvió" : "Todavía no se cargó nada"}>
            {evento.estado === "cerrado" ? "El resumen del cierre está más arriba." : "Elegí variantes y cantidades en “Cargar el viaje” y confirmá."}
          </Vacio>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-black">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="p-2">Producto</th>
                  <th className="p-2">Talle</th>
                  <th className="p-2">Color</th>
                  <th className="p-2">SKU</th>
                  <th className="p-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {enEvento.map((s) => (
                  <tr key={s.varianteId} className="border-t border-neutral-300">
                    <td className="p-2 font-bold">{s.producto}</td>
                    <td className="p-2">{s.talle}</td>
                    <td className="p-2">{s.color}</td>
                    <td className="p-2 font-mono">{s.sku}</td>
                    <td className={`p-2 text-right tabular-nums ${s.cantidad < 0 ? "font-black text-red-700" : ""}`}>{s.cantidad}</td>
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

function Cifra({ titulo, valor, detalle, tono = "neutro" }: { titulo: string; valor: string | number; detalle?: string; tono?: "neutro" | "rojo" | "azul" }) {
  const color = { neutro: "border-black", rojo: "border-red-700 bg-red-50 text-red-900", azul: "border-sky-700 bg-sky-50 text-sky-900" }[tono];
  return (
    <div className={`rounded-lg border-2 p-3 ${color}`}>
      <dt className="text-sm font-bold">{titulo}</dt>
      <dd className="text-2xl font-black tabular-nums">{valor}</dd>
      {detalle && <dd className="text-sm">{detalle}</dd>}
    </div>
  );
}
