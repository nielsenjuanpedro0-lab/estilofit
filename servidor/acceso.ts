import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NOMBRE_DE_ROL, puede, type Permiso } from "@/contrato/permisos";
import { COOKIE_SESION, leerSesion } from "@/servidor/sesion-panel";
import { usuarioDeSesion } from "@/servidor/usuarios";

// El middleware solo mira la firma de la cookie. Acá se chequea contra la base que el usuario
// siga activo, con la misma versión de sesión, y que su rol permita lo que pide.

export async function usuarioActual() {
  const sesion = await leerSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!sesion) return null;
  return usuarioDeSesion(sesion.usuarioId, sesion.versionSesion);
}

export type UsuarioActual = NonNullable<Awaited<ReturnType<typeof usuarioActual>>>;

const QUE_PERMITE: Record<Permiso, string> = {
  ver: "ver el panel",
  operar: "mover stock, cambiar el catálogo ni manejar eventos",
  administrar: "administrar usuarios, celulares ni auditoría",
};

// Para server actions: una acción es un POST que se puede armar a mano, así que cada una vuelve a chequear.
export async function exigirPermiso(permiso: Permiso): Promise<UsuarioActual> {
  const usuario = await usuarioActual();
  if (!usuario) throw new Error("La sesión venció o se cerró. Volvé a ingresar.");
  if (!puede(usuario.rol, permiso)) throw new Error(`Con el rol ${NOMBRE_DE_ROL[usuario.rol]} no se puede ${QUE_PERMITE[permiso]}.`);
  return usuario;
}

// Para páginas: sin sesión va al ingreso; sin permiso, al inicio con el aviso.
export async function paginaConPermiso(permiso: Permiso): Promise<UsuarioActual> {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/ingresar");
  if (!puede(usuario.rol, permiso)) redirect("/panel?aviso=sin-permiso");
  return usuario;
}
