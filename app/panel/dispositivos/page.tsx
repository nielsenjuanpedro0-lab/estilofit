import { desc } from "drizzle-orm";
import { revocarDispositivoAccion } from "@/app/panel/acciones";
import { AltaDeDispositivo } from "@/app/panel/dispositivos/alta-de-dispositivo";
import { db } from "@/db/conexion";
import { dispositivos } from "@/db/esquema";
import { momento } from "@/componentes/formato";
import { Boton, Vacio } from "@/componentes/primitivos";

function estado(d: typeof dispositivos.$inferSelect) {
  if (d.revocadoAt) return { texto: "Revocado", clase: "text-red-700" };
  if (d.enroladoAt) return { texto: "Activo", clase: "text-green-800" };
  if (d.codigoAltaVenceAt && d.codigoAltaVenceAt > new Date()) return { texto: "Esperando el código", clase: "text-amber-700" };
  return { texto: "Código vencido sin usar", clase: "text-neutral-500" };
}

export default async function Dispositivos() {
  const lista = await db().select().from(dispositivos).orderBy(desc(dispositivos.creadoAt));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Dispositivos</h1>
      <p>
        Solo un celular dado de alta puede bajar el catálogo de un evento y subir ventas. Si se pierde un celular, revocalo: deja de
        funcionar en el acto. Las ventas que ya subió quedan.
      </p>

      <section className="rounded-lg border-2 border-black p-4">
        <h2 className="mb-3 text-xl font-bold">Dar de alta un celular</h2>
        <AltaDeDispositivo />
      </section>

      {lista.length === 0 ? (
        <Vacio titulo="No hay celulares dados de alta">Generá un código arriba y escribilo en el celular que va a vender.</Vacio>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((d) => {
            const { texto, clase } = estado(d);
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-black p-3">
                <span className="text-lg font-bold">{d.nombre}</span>
                <span className={`font-bold ${clase}`}>{texto}</span>
                <span className="text-sm text-neutral-700">
                  {d.ultimoContactoAt ? `Último contacto: ${momento(d.ultimoContactoAt)}` : "Nunca se conectó"}
                </span>
                {!d.revocadoAt && (
                  // Dos pasos: un toque accidental no puede dejar sin funcionar a un celular en pleno evento.
                  <details className="ml-auto">
                    <summary className="flex min-h-12 cursor-pointer items-center rounded-lg border-2 border-red-700 px-4 font-bold text-red-700">
                      Revocar
                    </summary>
                    <form action={revocarDispositivoAccion.bind(null, d.id)} className="mt-2">
                      <Boton variante="peligro">Sí, revocar {d.nombre}</Boton>
                    </form>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
