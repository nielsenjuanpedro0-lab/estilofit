import { pbkdf2Sync, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { auditoria, usuarios } from "@/db/esquema";
import type { Rol } from "@/contrato/permisos";

// --- Claves y PIN ---

// scrypt: lento a propósito, con sal propia por usuario. Formato: scrypt$sal$hash (hex).
export function hashearClave(clave: string) {
  const sal = randomBytes(16);
  return `scrypt$${sal.toString("hex")}$${scryptSync(clave, sal, 64).toString("hex")}`;
}

export function claveCorrecta(clave: string, guardado: string) {
  const [algoritmo, sal, hash] = guardado.split("$");
  if (algoritmo !== "scrypt" || !sal || !hash) throw new Error("Hash de clave con formato desconocido");
  const esperado = Buffer.from(hash, "hex");
  return timingSafeEqual(scryptSync(clave, Buffer.from(sal, "hex"), esperado.length), esperado);
}

// El PIN se verifica en el celular, sin señal, con Web Crypto: por eso PBKDF2 y no scrypt.
// Formato: pbkdf2$iteraciones$sal$hash (hex). Ver celular/vendedor.ts, que hace la misma cuenta.
export const ITERACIONES_PIN = 50_000;
export function hashearPin(pin: string) {
  const sal = randomBytes(16);
  return `pbkdf2$${ITERACIONES_PIN}$${sal.toString("hex")}$${pbkdf2Sync(pin, sal, ITERACIONES_PIN, 32, "sha256").toString("hex")}`;
}

export const CLAVE_MINIMA = 10;
export const formatoDePin = /^\d{4}$/;

// --- Usuarios ---

export type DatosDeUsuario = { nombre: string; rol: Rol; email: string | null; clave: string | null; pin: string | null };

// Quien entra al panel necesita email y clave; quien vende, PIN. Un administrador puede tener las dos cosas.
export function problemaConDatos(datos: DatosDeUsuario): string | null {
  if (datos.rol === "vendedor") {
    if (!datos.pin) return "Un vendedor necesita un PIN de 4 números para vender desde el celular.";
  } else if (!datos.email) {
    return "Para entrar al panel hace falta un email.";
  }
  if (datos.clave !== null && datos.clave.length < CLAVE_MINIMA) return `La clave tiene que tener al menos ${CLAVE_MINIMA} caracteres.`;
  if (datos.pin !== null && !formatoDePin.test(datos.pin)) return "El PIN tiene que ser de 4 números.";
  return null;
}

export async function crearUsuario(datos: DatosDeUsuario) {
  const problema = problemaConDatos(datos);
  if (problema) throw new Error(problema);
  const [usuario] = await db()
    .insert(usuarios)
    .values({
      nombre: datos.nombre,
      rol: datos.rol,
      email: datos.email?.toLowerCase() ?? null,
      claveHash: datos.clave ? hashearClave(datos.clave) : null,
      pinHash: datos.pin ? hashearPin(datos.pin) : null,
    })
    .returning();
  if (!usuario) throw new Error("No se creó el usuario");
  return usuario;
}

export async function hayUsuarios() {
  return (await db().$count(usuarios)) > 0;
}

export async function autenticarConClave(email: string, clave: string) {
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.email, email.trim().toLowerCase()));
  // La cuenta igual se hace aunque el email no exista: así no se puede saber por el tiempo qué emails hay.
  const hash = usuario?.claveHash ?? hashearClave("cuenta-de-relleno");
  const correcta = claveCorrecta(clave, hash);
  if (!usuario || !correcta || !usuario.activo || usuario.rol === "vendedor") return null;
  await db().update(usuarios).set({ ultimoIngresoAt: new Date() }).where(eq(usuarios.id, usuario.id));
  return usuario;
}

export async function usuarioDeSesion(id: number, versionSesion: number) {
  const [usuario] = await db().select().from(usuarios).where(eq(usuarios.id, id));
  if (!usuario || !usuario.activo || usuario.versionSesion !== versionSesion || usuario.rol === "vendedor") return null;
  return usuario;
}

export async function listarUsuarios() {
  return db().select().from(usuarios).orderBy(asc(usuarios.activo), asc(usuarios.nombre));
}

// Cambiar la clave, el rol o desactivar cierra las sesiones abiertas de ese usuario.
const cerrarSesiones = sql`${usuarios.versionSesion} + 1`;

export async function editarUsuario(id: number, cambios: { nombre: string; email: string | null; rol: Rol }) {
  const [antes] = await db().select().from(usuarios).where(eq(usuarios.id, id));
  if (!antes) throw new Error("El usuario no existe");
  await db()
    .update(usuarios)
    .set({ ...cambios, email: cambios.email?.toLowerCase() ?? null, ...(antes.rol !== cambios.rol ? { versionSesion: cerrarSesiones } : {}) })
    .where(eq(usuarios.id, id));
}

export async function cambiarClave(id: number, clave: string) {
  await db().update(usuarios).set({ claveHash: hashearClave(clave), versionSesion: cerrarSesiones }).where(eq(usuarios.id, id));
}

export async function cambiarPin(id: number, pin: string) {
  await db().update(usuarios).set({ pinHash: hashearPin(pin) }).where(eq(usuarios.id, id));
}

export async function cambiarActivo(id: number, activo: boolean) {
  await db().update(usuarios).set({ activo, versionSesion: cerrarSesiones }).where(eq(usuarios.id, id));
}

// Siempre tiene que quedar alguien que pueda administrar.
export async function otrosAdministradoresActivos(id: number) {
  return db().$count(usuarios, and(eq(usuarios.rol, "administrador"), eq(usuarios.activo, true), ne(usuarios.id, id)));
}

// Para el celular: quiénes pueden vender y cómo verificar su PIN sin señal.
export async function vendedoresHabilitados() {
  return db()
    .select({ id: usuarios.id, nombre: usuarios.nombre, pinHash: usuarios.pinHash })
    .from(usuarios)
    .where(and(eq(usuarios.activo, true), sql`${usuarios.pinHash} is not null`))
    .orderBy(asc(usuarios.nombre));
}

// --- Auditoría ---

export async function registrarAuditoria(usuarioId: number | null, accion: string, detalle: string) {
  await db().insert(auditoria).values({ usuarioId, accion, detalle });
}
