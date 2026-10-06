import Link from "next/link";
import { crearEventoAccion } from "@/app/panel/acciones";
import { ESTADO_EVENTO, pesos, rangoDeFechas } from "@/componentes/formato";
import { BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Indicador, Insignia, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { resumenDeEventos } from "@/servidor/eventos";

const TONO_DE_ESTADO = { preparacion: "alerta", abierto: "bueno", cerrado: "neutro" } as const;

export default async function Eventos() {
  const yo = await paginaConPermiso("ver");
  const lista = await resumenDeEventos();
  const enCurso = lista.filter((e) => e.estado !== "cerrado");
  const cerrados = lista.filter((e) => e.estado === "cerrado");
  const facturadoCerrados = cerrados.reduce((s, e) => s + e.facturado, 0);

  return (
    <>
      <EncabezadoDePagina
        titulo="Eventos"
        descripcion="Cada evento tiene su propio stock. Un segundo equipo de venta es otro evento, con otro nombre (por ejemplo “K42 · Equipo 2”)."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo="En curso" valor={enCurso.length} detalle="En preparación o abiertos" tono={enCurso.length > 0 ? "bueno" : "neutro"} />
        <Indicador titulo="Cerrados" valor={cerrados.length} />
        <Indicador titulo="Facturado en cerrados" valor={pesos(facturadoCerrados)} />
        <Indicador
          titulo="Ventas para revisar"
          valor={lista.reduce((s, e) => s + e.paraRevisar, 0)}
          tono={lista.some((e) => e.paraRevisar > 0) ? "alerta" : "bueno"}
          href="/panel/ventas?estado=revisar"
        />
      </div>

      <div className={`grid gap-6 ${puede(yo.rol, "operar") ? "xl:grid-cols-[2fr_1fr]" : ""}`}>
        {lista.length === 0 ? (
          <Vacio titulo="Todavía no hay eventos">Creá el primero y después cargale el stock que viaja.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Fechas</th>
                  <th>Estado</th>
                  <th className="numero">Llevadas</th>
                  <th className="numero">Vendidas</th>
                  <th className="numero">Ventas</th>
                  <th className="numero">Facturado</th>
                  <th className="numero">Revisar</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/panel/eventos/${e.id}`} className="font-bold underline">
                        {e.nombre}
                      </Link>
                      <div className="text-xs text-neutral-600">{e.lugar}</div>
                    </td>
                    <td className="whitespace-nowrap">{rangoDeFechas(e.fechaDesde, e.fechaHasta)}</td>
                    <td>
                      <Insignia tono={TONO_DE_ESTADO[e.estado]}>{ESTADO_EVENTO[e.estado]}</Insignia>
                    </td>
                    <td className="numero">{e.llevadas}</td>
                    <td className="numero">{e.vendidas}</td>
                    <td className="numero">{e.ventas}</td>
                    <td className="numero font-bold">{pesos(e.facturado)}</td>
                    <td className={`numero ${e.paraRevisar > 0 ? "font-black text-red-700" : ""}`}>{e.paraRevisar}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        )}

        {puede(yo.rol, "operar") && (
          <Tarjeta titulo="Nuevo evento" descripcion="Después de crearlo, le cargás el viaje desde el depósito.">
            <Formulario accion={crearEventoAccion}>
              <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Patagonia Run" />
              <Campo etiqueta="Lugar" name="lugar" required placeholder="Ej: San Martín de los Andes" />
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Desde" name="fechaDesde" type="date" required />
                <Campo etiqueta="Hasta" name="fechaHasta" type="date" required />
              </div>
              <BotonEnviar variante="destacado">Crear evento y preparar el viaje</BotonEnviar>
            </Formulario>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
