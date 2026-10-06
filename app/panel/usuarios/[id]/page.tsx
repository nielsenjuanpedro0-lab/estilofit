import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { cambiarActivoUsuarioAccion, cambiarClaveDeUsuarioAccion, cambiarPinAccion, editarUsuarioAccion } from "@/app/panel/acciones-usuarios";
import { momento } from "@/componentes/formato";
import { BotonEnviar, Campo, EncabezadoDePagina, Formulario, Insignia, Selector, Tarjeta } from "@/componentes/primitivos";
import { DESCRIPCION_DE_ROL, NOMBRE_DE_ROL, ROLES } from "@/contrato/permisos";
import { db } from "@/db/conexion";
import { auditoria, usuarios, ventas } from "@/db/esquema";
import { paginaConPermiso } from "@/servidor/acceso";
import { CLAVE_MINIMA } from "@/servidor/usuarios";

export default async function Usuario({ params }: { params: Promise<{ id: string }> }) {
  const yo = await paginaConPermiso("administrar");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.id, id));
  if (!usuario) notFound();

  const [ventasHechas, actividad] = await Promise.all([
    db().$count(ventas, and(eq(ventas.usuarioId, id), eq(ventas.anulada, false))),
    db().select().from(auditoria).where(eq(auditoria.usuarioId, id)).orderBy(desc(auditoria.id)).limit(10),
  ]);

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/usuarios", nombre: "Usuarios" }]}
        titulo={usuario.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Insignia tono="oscuro">{NOMBRE_DE_ROL[usuario.rol]}</Insignia>
            {usuario.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Desactivado</Insignia>}
            <span>
              {usuario.email ?? "Sin email"} · {ventasHechas} ventas a su nombre · último ingreso {usuario.ultimoIngresoAt ? momento(usuario.ultimoIngresoAt) : "nunca"}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Datos y rol" descripcion="Cambiar el rol cierra sus sesiones abiertas.">
          <Formulario accion={editarUsuarioAccion.bind(null, usuario.id)}>
            <Campo etiqueta="Nombre y apellido" name="nombre" defaultValue={usuario.nombre} required />
            <Campo etiqueta="Email" name="email" type="email" defaultValue={usuario.email ?? ""} autoComplete="off" />
            <Selector etiqueta="Rol" name="rol" defaultValue={usuario.rol}>
              {ROLES.map((rol) => (
                <option key={rol} value={rol}>
                  {NOMBRE_DE_ROL[rol]}: {DESCRIPCION_DE_ROL[rol]}
                </option>
              ))}
            </Selector>
            <BotonEnviar>Guardar</BotonEnviar>
          </Formulario>
        </Tarjeta>

        <div className="flex flex-col gap-6">
          <Tarjeta titulo="Clave del panel" descripcion={`Mínimo ${CLAVE_MINIMA} caracteres. Pasásela en persona. Cierra sus sesiones abiertas.`}>
            <Formulario accion={cambiarClaveDeUsuarioAccion.bind(null, usuario.id)} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Campo etiqueta={usuario.claveHash ? "Clave nueva" : "Clave"} name="clave" type="password" minLength={CLAVE_MINIMA} required autoComplete="new-password" />
              </div>
              <BotonEnviar variante="secundario">{usuario.claveHash ? "Cambiar clave" : "Poner clave"}</BotonEnviar>
            </Formulario>
          </Tarjeta>

          <Tarjeta titulo="PIN para vender" descripcion="4 números. Identifica a quien vende en el celular; los celulares lo reciben al actualizar el paquete del evento.">
            <Formulario accion={cambiarPinAccion.bind(null, usuario.id)} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <Campo etiqueta={usuario.pinHash ? "PIN nuevo" : "PIN"} name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" />
              </div>
              <BotonEnviar variante="secundario">{usuario.pinHash ? "Cambiar PIN" : "Poner PIN"}</BotonEnviar>
            </Formulario>
          </Tarjeta>

          {usuario.id !== yo.id && (
            <Tarjeta
              titulo={usuario.activo ? "Desactivar" : "Reactivar"}
              descripcion={usuario.activo ? "No puede entrar al panel ni vender. Sus ventas y su historial quedan." : "Vuelve a poder entrar y vender."}
            >
              <Formulario accion={cambiarActivoUsuarioAccion.bind(null, usuario.id, !usuario.activo)}>
                <BotonEnviar variante={usuario.activo ? "peligro" : "secundario"}>{usuario.activo ? `Desactivar a ${usuario.nombre}` : `Reactivar a ${usuario.nombre}`}</BotonEnviar>
              </Formulario>
            </Tarjeta>
          )}
        </div>
      </div>

      <Tarjeta titulo="Lo último que hizo en el panel">
        {actividad.length === 0 ? (
          <p className="text-neutral-700">Sin actividad registrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-200">
            {actividad.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-3 py-2">
                <span className="w-40 shrink-0 text-sm text-neutral-600">{momento(a.ocurridoAt)}</span>
                <Insignia>{a.accion}</Insignia>
                <span>{a.detalle}</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
