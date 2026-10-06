import Link from "next/link";
import { asc, ne, sql } from "drizzle-orm";
import { cambiarUbicacionActivaAccion, crearUbicacionAccion, renombrarUbicacionAccion } from "@/app/panel/acciones";
import { db } from "@/db/conexion";
import { ubicaciones } from "@/db/esquema";
import { TIPO_UBICACION } from "@/componentes/formato";
import { Boton, BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Insignia, Selector, Tarjeta } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";

export default async function Ubicaciones() {
  const yo = await paginaConPermiso("ver");
  const opera = puede(yo.rol, "operar");
  // Las de tipo evento se crean y se ven desde Eventos.
  const lista = await db()
    .select({
      id: ubicaciones.id,
      nombre: ubicaciones.nombre,
      tipo: ubicaciones.tipo,
      activa: ubicaciones.activa,
      // Columna de la ubicación escrita a mano y calificada: la consulta no tiene JOINs.
      unidades: sql`(select coalesce(sum(s.cantidad), 0) from stock_actual s where s.ubicacion_id = "ubicaciones"."id")`.mapWith(Number),
    })
    .from(ubicaciones)
    .where(ne(ubicaciones.tipo, "evento"))
    .orderBy(asc(ubicaciones.id));

  return (
    <>
      <EncabezadoDePagina
        titulo="Ubicaciones"
        descripcion="Los lugares fijos donde hay mercadería: depósitos, showrooms y la web. Cada evento tiene su propia ubicación y se crea sola desde Eventos."
      />

      <div className={`grid gap-6 ${opera ? "xl:grid-cols-[2fr_1fr]" : ""}`}>
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th className="numero">Unidades</th>
                <th>Estado</th>
                {opera && <th />}
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.activa ? "" : "text-neutral-500"}>
                  <td>
                    {opera ? (
                      <Formulario accion={renombrarUbicacionAccion.bind(null, u.id)} className="flex flex-wrap items-center gap-2">
                        <input
                          name="nombre"
                          defaultValue={u.nombre}
                          aria-label="Nombre de la ubicación"
                          className="min-h-11 rounded-lg border-2 border-black px-3 font-bold"
                        />
                        <BotonEnviar variante="secundario" className="min-h-11 text-sm">
                          Renombrar
                        </BotonEnviar>
                      </Formulario>
                    ) : (
                      <span className="font-bold">{u.nombre}</span>
                    )}
                  </td>
                  <td>{TIPO_UBICACION[u.tipo]}</td>
                  <td className="numero font-bold">
                    <Link href={`/panel/stock?ubicacion=${u.id}`} className="hover:underline">
                      {u.unidades}
                    </Link>
                  </td>
                  <td>{u.activa ? <Insignia tono="bueno">Activa</Insignia> : <Insignia tono="malo">Inactiva</Insignia>}</td>
                  {opera && (
                    <td className="text-right">
                      <form action={cambiarUbicacionActivaAccion.bind(null, u.id, !u.activa)}>
                        <Boton variante="secundario" className="min-h-11 text-sm">
                          {u.activa ? "Desactivar" : "Reactivar"}
                        </Boton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>

        {opera && (
          <Tarjeta titulo="Nueva ubicación">
            <Formulario accion={crearUbicacionAccion}>
              <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Depósito Mar del Plata" />
              <Selector etiqueta="Tipo" name="tipo" defaultValue="deposito">
                <option value="deposito">Depósito</option>
                <option value="showroom">Showroom</option>
                <option value="web">Web</option>
              </Selector>
              <BotonEnviar>Crear ubicación</BotonEnviar>
            </Formulario>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
