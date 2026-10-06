import Link from "next/link";
import { crearUsuarioAccion } from "@/app/panel/acciones-usuarios";
import { momento } from "@/componentes/formato";
import { BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Indicador, Insignia, Selector, Tarjeta } from "@/componentes/primitivos";
import { DESCRIPCION_DE_ROL, NOMBRE_DE_ROL, ROLES } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { CLAVE_MINIMA, listarUsuarios } from "@/servidor/usuarios";

const TONO_DE_ROL = { administrador: "oscuro", encargado: "info", consulta: "neutro", vendedor: "bueno" } as const;

export default async function Usuarios() {
  const yo = await paginaConPermiso("administrar");
  const lista = await listarUsuarios();
  const activos = lista.filter((u) => u.activo);

  return (
    <>
      <EncabezadoDePagina
        titulo="Usuarios"
        descripcion="Quién entra al panel, con qué rol, y quién vende desde el celular con su PIN. Las claves y los PIN se guardan cifrados: nadie los puede ver, solo cambiar."
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {ROLES.map((rol) => (
          <Indicador key={rol} titulo={NOMBRE_DE_ROL[rol]} valor={activos.filter((u) => u.rol === rol).length} detalle={DESCRIPCION_DE_ROL[rol]} />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Rol</th>
                <th>Vende con PIN</th>
                <th>Último ingreso</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className={u.activo ? "" : "text-neutral-500"}>
                  <td>
                    <Link href={`/panel/usuarios/${u.id}`} className="font-bold underline">
                      {u.nombre}
                    </Link>
                    {u.id === yo.id && <span className="ml-2 text-xs font-bold">(vos)</span>}
                  </td>
                  <td>{u.email ?? "—"}</td>
                  <td>
                    <Insignia tono={TONO_DE_ROL[u.rol]}>{NOMBRE_DE_ROL[u.rol]}</Insignia>
                  </td>
                  <td>{u.pinHash ? "Sí" : "No"}</td>
                  <td className="whitespace-nowrap">{u.ultimoIngresoAt ? momento(u.ultimoIngresoAt) : "—"}</td>
                  <td>{u.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Desactivado</Insignia>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>

        <Tarjeta titulo="Nuevo usuario" descripcion={`Para el panel: email y clave de al menos ${CLAVE_MINIMA} caracteres. Para vender: PIN de 4 números.`}>
          <Formulario accion={crearUsuarioAccion}>
            <Campo etiqueta="Nombre y apellido" name="nombre" required />
            <Selector etiqueta="Rol" name="rol" defaultValue="vendedor">
              {ROLES.map((rol) => (
                <option key={rol} value={rol}>
                  {NOMBRE_DE_ROL[rol]}: {DESCRIPCION_DE_ROL[rol]}
                </option>
              ))}
            </Selector>
            <Campo etiqueta="Email (no hace falta para vendedores)" name="email" type="email" autoComplete="off" />
            <Campo etiqueta="Clave para el panel" name="clave" type="password" autoComplete="new-password" />
            <Campo etiqueta="PIN para vender (4 números)" name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" />
            <BotonEnviar>Crear usuario</BotonEnviar>
          </Formulario>
        </Tarjeta>
      </div>
    </>
  );
}
