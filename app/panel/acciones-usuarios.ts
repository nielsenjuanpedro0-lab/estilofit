"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id, primerError, texto, type EstadoFormulario } from "@/app/panel/validacion";
import { NOMBRE_DE_ROL, ROLES } from "@/contrato/permisos";
import { db } from "@/db/conexion";
import { usuarios } from "@/db/esquema";
import { exigirPermiso } from "@/servidor/acceso";
import {
  CLAVE_MINIMA,
  cambiarActivo,
  cambiarClave,
  cambiarPin,
  claveCorrecta,
  crearUsuario,
  editarUsuario,
  formatoDePin,
  otrosAdministradoresActivos,
  problemaConDatos,
  registrarAuditoria,
} from "@/servidor/usuarios";

// Usuarios y roles: solo los administra un administrador. Cada cambio queda en la auditoría,
// sin claves ni PIN, que nunca se registran.

const opcional = z
  .string()
  .trim()
  .transform((s) => (s === "" ? null : s));

const DatosDeUsuario = z.object({
  nombre: texto("Poné el nombre"),
  email: opcional.pipe(z.email("El email no es válido").nullable()),
  rol: z.enum(ROLES, { error: "Elegí un rol" }),
});

async function emailEnUso(email: string | null, salvoId: number | null) {
  if (!email) return false;
  const [otro] = await db()
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(salvoId === null ? eq(usuarios.email, email.toLowerCase()) : and(eq(usuarios.email, email.toLowerCase()), ne(usuarios.id, salvoId)));
  return otro !== undefined;
}

export async function crearUsuarioAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const datos = DatosDeUsuario.extend({ clave: opcional, pin: opcional }).safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  if (datos.data.rol !== "vendedor" && !datos.data.clave) return { error: `Para entrar al panel hace falta una clave de al menos ${CLAVE_MINIMA} caracteres.` };
  const problema = problemaConDatos(datos.data);
  if (problema) return { error: problema };
  if (await emailEnUso(datos.data.email, null)) return { error: `Ya hay un usuario con el email ${datos.data.email}` };

  const usuario = await crearUsuario(datos.data);
  await registrarAuditoria(yo.id, "Usuarios", `Creó a ${usuario.nombre} como ${NOMBRE_DE_ROL[usuario.rol]}${usuario.pinHash ? ", con PIN para vender" : ""}`);
  revalidatePath("/panel/usuarios", "layout");
  return { exito: `Se creó a ${usuario.nombre}` };
}

export async function editarUsuarioAccion(usuarioId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const datos = DatosDeUsuario.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [antes] = await db().select().from(usuarios).where(eq(usuarios.id, id.parse(usuarioId)));
  if (!antes) return { error: "El usuario no existe. Recargá la página." };

  if (antes.rol === "administrador" && datos.data.rol !== "administrador" && (await otrosAdministradoresActivos(antes.id)) === 0) {
    return { error: "Es el único administrador activo. Nombrá a otro administrador antes de cambiarle el rol." };
  }
  if (datos.data.rol === "vendedor" && !antes.pinHash) return { error: "Para pasarlo a vendedor, primero ponele un PIN." };
  if (datos.data.rol !== "vendedor" && (!datos.data.email || !antes.claveHash)) {
    return { error: "Para entrar al panel necesita email y clave. Completá el email y poné una clave abajo." };
  }
  if (await emailEnUso(datos.data.email, antes.id)) return { error: `Ya hay un usuario con el email ${datos.data.email}` };

  await editarUsuario(antes.id, datos.data);
  const cambios = [
    antes.nombre !== datos.data.nombre && `nombre ${antes.nombre} → ${datos.data.nombre}`,
    (antes.email ?? "") !== (datos.data.email?.toLowerCase() ?? "") && `email ${antes.email ?? "sin email"} → ${datos.data.email ?? "sin email"}`,
    antes.rol !== datos.data.rol && `rol ${NOMBRE_DE_ROL[antes.rol]} → ${NOMBRE_DE_ROL[datos.data.rol]}`,
  ].filter(Boolean);
  if (cambios.length > 0) await registrarAuditoria(yo.id, "Usuarios", `Editó a ${antes.nombre}: ${cambios.join(", ")}`);
  revalidatePath("/panel/usuarios", "layout");
  return { exito: antes.rol !== datos.data.rol ? "Guardado. Sus sesiones abiertas se cerraron por el cambio de rol." : "Guardado" };
}

export async function cambiarClaveDeUsuarioAccion(usuarioId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const clave = z.string().min(CLAVE_MINIMA, `La clave tiene que tener al menos ${CLAVE_MINIMA} caracteres`).safeParse(formulario.get("clave"));
  if (!clave.success) return { error: primerError(clave.error) };
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.id, id.parse(usuarioId)));
  if (!usuario) return { error: "El usuario no existe. Recargá la página." };
  await cambiarClave(usuario.id, clave.data);
  await registrarAuditoria(yo.id, "Usuarios", `Cambió la clave de ${usuario.nombre}`);
  return { exito: `Clave cambiada. Pasásela a ${usuario.nombre} en persona; sus sesiones abiertas se cerraron.` };
}

export async function cambiarPinAccion(usuarioId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const pin = z.string().regex(formatoDePin, "El PIN tiene que ser de 4 números").safeParse(formulario.get("pin"));
  if (!pin.success) return { error: primerError(pin.error) };
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.id, id.parse(usuarioId)));
  if (!usuario) return { error: "El usuario no existe. Recargá la página." };
  await cambiarPin(usuario.id, pin.data);
  await registrarAuditoria(yo.id, "Usuarios", `${usuario.pinHash ? "Cambió" : "Puso"} el PIN de ${usuario.nombre}`);
  revalidatePath("/panel/usuarios", "layout");
  return { exito: "PIN guardado. Los celulares lo reciben cuando actualicen el paquete del evento." };
}

export async function cambiarActivoUsuarioAccion(usuarioId: number, activo: boolean): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.id, id.parse(usuarioId)));
  if (!usuario) return { error: "El usuario no existe. Recargá la página." };
  if (!activo && usuario.id === yo.id) return { error: "No te podés desactivar a vos mismo." };
  if (!activo && usuario.rol === "administrador" && (await otrosAdministradoresActivos(usuario.id)) === 0) {
    return { error: "Es el único administrador activo: no se puede desactivar." };
  }
  await cambiarActivo(usuario.id, z.boolean().parse(activo));
  await registrarAuditoria(yo.id, "Usuarios", `${activo ? "Reactivó" : "Desactivó"} a ${usuario.nombre}`);
  revalidatePath("/panel/usuarios", "layout");
  return { exito: activo ? `${usuario.nombre} puede volver a entrar y vender.` : `${usuario.nombre} ya no puede entrar ni vender.` };
}

// Cualquiera que entre al panel cambia su propia clave, sabiendo la actual.
export async function cambiarMiClaveAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("ver");
  const datos = z
    .object({
      actual: z.string().min(1, "Poné tu clave actual"),
      nueva: z.string().min(CLAVE_MINIMA, `La clave nueva tiene que tener al menos ${CLAVE_MINIMA} caracteres`),
      repetida: z.string(),
    })
    .refine((d) => d.nueva === d.repetida, { message: "La clave nueva y la repetida no coinciden" })
    .safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  if (!yo.claveHash || !claveCorrecta(datos.data.actual, yo.claveHash)) return { error: "La clave actual no es correcta." };
  await cambiarClave(yo.id, datos.data.nueva);
  await registrarAuditoria(yo.id, "Usuarios", "Cambió su propia clave");
  return { exito: "Clave cambiada. Las demás sesiones abiertas se cerraron; esta también: volvé a ingresar." };
}
