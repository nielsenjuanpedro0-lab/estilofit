import { desc, eq, sql } from "drizzle-orm";
import { revocarDispositivoAccion } from "@/app/panel/acciones";
import { AltaDeDispositivo } from "@/app/panel/dispositivos/alta-de-dispositivo";
import { db } from "@/db/conexion";
import { dispositivos, eventos } from "@/db/esquema";
import { momento } from "@/componentes/formato";
import { Boton, ContenedorTabla, EncabezadoDePagina, Indicador, Insignia, Tarjeta, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";

type Celular = typeof dispositivos.$inferSelect;

function estado(d: Celular) {
  if (d.revocadoAt) return { texto: "Revocado", tono: "malo" } as const;
  if (d.enroladoAt) return { texto: "Activo", tono: "bueno" } as const;
  if (d.codigoAltaVenceAt && d.codigoAltaVenceAt > new Date()) return { texto: "Esperando el código", tono: "alerta" } as const;
  return { texto: "Código vencido", tono: "neutro" } as const;
}

export default async function Celulares() {
  await paginaConPermiso("administrar");
  const lista = await db()
    .select({
      celular: dispositivos,
      evento: eventos.nombre,
      // Columna del celular escrita a mano y calificada (subselect correlacionado).
      ventas: sql`(select count(*) from ventas v where v.device_id = "dispositivos"."id")`.mapWith(Number),
    })
    .from(dispositivos)
    .leftJoin(eventos, eq(eventos.id, dispositivos.eventoId))
    .orderBy(desc(dispositivos.creadoAt));
  const activos = lista.filter((f) => !f.celular.revocadoAt && f.celular.enroladoAt);
  const conPendientes = activos.filter((f) => (f.celular.pendientesInformadas ?? 0) > 0);

  return (
    <>
      <EncabezadoDePagina
        titulo="Celulares"
        descripcion="Solo un celular dado de alta puede bajar el catálogo de un evento y subir ventas. Si se pierde uno, revocalo: deja de funcionar en el acto y sus ventas ya subidas quedan."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Indicador titulo="Activos" valor={activos.length} />
        <Indicador titulo="Con ventas sin subir" valor={conPendientes.length} tono={conPendientes.length > 0 ? "alerta" : "bueno"} />
        <Indicador titulo="Revocados" valor={lista.filter((f) => f.celular.revocadoAt).length} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        {lista.length === 0 ? (
          <Vacio titulo="No hay celulares dados de alta">Generá un código y escribilo en el celular que va a vender.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Celular</th>
                  <th>Estado</th>
                  <th>Último evento bajado</th>
                  <th className="numero">Ventas subidas</th>
                  <th className="numero">Sin subir</th>
                  <th>Último contacto</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lista.map(({ celular: d, evento, ventas }) => {
                  const { texto, tono } = estado(d);
                  return (
                    <tr key={d.id} className={d.revocadoAt ? "text-neutral-500" : ""}>
                      <td className="font-bold">{d.nombre}</td>
                      <td>
                        <Insignia tono={tono}>{texto}</Insignia>
                      </td>
                      <td>{evento ?? "—"}</td>
                      <td className="numero">{ventas}</td>
                      <td className={`numero ${(d.pendientesInformadas ?? 0) > 0 ? "font-black text-amber-800" : ""}`}>
                        {d.pendientesInformadas ?? "—"}
                      </td>
                      <td className="whitespace-nowrap">{d.ultimoContactoAt ? momento(d.ultimoContactoAt) : "Nunca"}</td>
                      <td className="text-right">
                        {!d.revocadoAt && (
                          // Dos pasos: un toque accidental no puede dejar sin funcionar a un celular en pleno evento.
                          <details className="inline-block text-left">
                            <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border-2 border-red-700 px-3 font-bold text-red-700">
                              Revocar
                            </summary>
                            <form action={revocarDispositivoAccion.bind(null, d.id)} className="mt-2">
                              <Boton variante="peligro" className="min-h-11 text-sm">
                                Sí, revocar {d.nombre}
                              </Boton>
                            </form>
                          </details>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ContenedorTabla>
        )}

        <Tarjeta titulo="Dar de alta un celular" descripcion="Generá un código y escribilo en el celular, en la app, con señal. Sirve una sola vez y vence en 15 minutos.">
          <AltaDeDispositivo />
        </Tarjeta>
      </div>
    </>
  );
}
