import Link from "next/link";
import { crearEventoAccion } from "@/app/panel/acciones";
import { BotonEnviar, Campo, Formulario, Vacio } from "@/componentes/primitivos";
import { ESTADO_EVENTO, pesos, rangoDeFechas } from "@/componentes/formato";
import { resumenDeEventos } from "@/servidor/eventos";

export default async function Eventos() {
  const lista = await resumenDeEventos();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Eventos</h1>

      <section className="rounded-lg border-2 border-black p-4">
        <h2 className="mb-3 text-xl font-bold">Nuevo evento</h2>
        <p className="mb-3 text-sm">
          Cada evento tiene su propio stock. Si sale un segundo equipo de venta, creá otro evento (por ejemplo “K42 · Equipo 2”).
        </p>
        <Formulario accion={crearEventoAccion} className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Patagonia Run" />
          <Campo etiqueta="Lugar" name="lugar" required placeholder="Ej: San Martín de los Andes" />
          <Campo etiqueta="Desde" name="fechaDesde" type="date" required />
          <Campo etiqueta="Hasta" name="fechaHasta" type="date" required />
          <BotonEnviar className="sm:col-span-2">Crear evento y preparar el viaje</BotonEnviar>
        </Formulario>
      </section>

      {lista.length === 0 ? (
        <Vacio titulo="Todavía no hay eventos">Creá el primero con el formulario de arriba y después cargale el stock que viaja.</Vacio>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-black">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-neutral-100">
              <tr>
                <th className="p-2">Evento</th>
                <th className="p-2">Fechas</th>
                <th className="p-2">Estado</th>
                <th className="p-2 text-right">Llevadas</th>
                <th className="p-2 text-right">Vendidas</th>
                <th className="p-2 text-right">Facturado</th>
                <th className="p-2 text-right">Para revisar</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="border-t border-neutral-300">
                  <td className="p-2">
                    <Link href={`/panel/eventos/${e.id}`} className="font-bold underline">
                      {e.nombre}
                    </Link>
                    <div className="text-neutral-600">{e.lugar}</div>
                  </td>
                  <td className="p-2">{rangoDeFechas(e.fechaDesde, e.fechaHasta)}</td>
                  <td className="p-2 font-bold">{ESTADO_EVENTO[e.estado]}</td>
                  <td className="p-2 text-right tabular-nums">{e.llevadas}</td>
                  <td className="p-2 text-right tabular-nums">{e.vendidas}</td>
                  <td className="p-2 text-right tabular-nums">{pesos(e.facturado)}</td>
                  <td className={`p-2 text-right tabular-nums ${e.paraRevisar > 0 ? "font-black text-red-700" : ""}`}>{e.paraRevisar}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
