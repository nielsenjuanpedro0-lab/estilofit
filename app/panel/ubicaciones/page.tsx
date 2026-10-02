import { asc, ne } from "drizzle-orm";
import { cambiarUbicacionActivaAccion, crearUbicacionAccion } from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { ubicaciones } from "@/db/esquema";
import { TIPO_UBICACION } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, Formulario, Selector } from "@/componentes/primitivos";

export default async function Ubicaciones() {
  // Las de tipo evento se crean y se ven desde Eventos.
  const lista = await db().select().from(ubicaciones).where(ne(ubicaciones.tipo, "evento")).orderBy(asc(ubicaciones.id));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Ubicaciones</h1>
      <p>Cada evento tiene su propia ubicación y se crea sola desde Eventos. Acá van las fijas: depósitos, showrooms y la web.</p>

      <section className="rounded-lg border-2 border-black p-4">
        <h2 className="mb-3 text-xl font-bold">Nueva ubicación</h2>
        <Formulario accion={crearUbicacionAccion} className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Depósito Mar del Plata" />
          <Selector etiqueta="Tipo" name="tipo" defaultValue="deposito">
            <option value="deposito">Depósito</option>
            <option value="showroom">Showroom</option>
            <option value="web">Web</option>
          </Selector>
          <BotonEnviar>Crear</BotonEnviar>
        </Formulario>
      </section>

      <ul className="flex flex-col gap-2">
        {lista.map((u) => (
          <li key={u.id} className={`flex flex-wrap items-center gap-3 rounded-lg border-2 border-black p-3 ${u.activa ? "" : "opacity-60"}`}>
            <span className="text-lg font-bold">{u.nombre}</span>
            <span>{TIPO_UBICACION[u.tipo]}</span>
            {!u.activa && <span className="text-sm font-bold uppercase">inactiva</span>}
            <form action={cambiarUbicacionActivaAccion.bind(null, u.id, !u.activa)} className="ml-auto">
              <Boton variante="secundario">{u.activa ? "Desactivar" : "Reactivar"}</Boton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
