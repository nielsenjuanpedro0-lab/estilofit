// Cookie de sesión del panel: usuario, versión de sesión y vencimiento, firmados con HMAC.
// Usa Web Crypto y no toca la base porque también corre en el middleware. Que el usuario siga
// activo y con la misma versión lo chequea servidor/acceso.ts en cada pedido.

export const COOKIE_SESION = "sesion_panel";
export const DURACION_SESION_S = 12 * 60 * 60;

const codificador = new TextEncoder();

function secreto() {
  const valor = process.env.SECRETO_SESION;
  if (!valor || valor.length < 32) throw new Error("Falta SECRETO_SESION en .env.local (mínimo 32 caracteres)");
  return valor;
}

async function firmar(texto: string) {
  const clave = await crypto.subtle.importKey("raw", codificador.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", clave, codificador.encode(texto)));
  return btoa(String.fromCharCode(...firma)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Comparación en tiempo constante: no corta en el primer carácter distinto.
function igualesEnTiempoConstante(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

// Solo sirve para crear el primer administrador, cuando todavía no hay ningún usuario.
export async function claveDeInstalacionCorrecta(intento: string) {
  const clave = process.env.CLAVE_INSTALACION;
  if (!clave) throw new Error("Falta CLAVE_INSTALACION en .env.local");
  // Se comparan las firmas y no las claves, así el largo de la clave real no se filtra por tiempo.
  return igualesEnTiempoConstante(await firmar(intento), await firmar(clave));
}

export async function crearValorDeSesion(usuarioId: number, versionSesion: number) {
  const venceEn = Math.floor(Date.now() / 1000) + DURACION_SESION_S;
  const datos = `${usuarioId}.${versionSesion}.${venceEn}`;
  return `${datos}.${await firmar(datos)}`;
}

export async function leerSesion(valor: string | undefined) {
  const partes = valor?.split(".") ?? [];
  const [usuarioId, versionSesion, venceEn, firma] = partes;
  if (partes.length !== 4 || !usuarioId || !versionSesion || !venceEn || !firma) return null;
  if (![usuarioId, versionSesion, venceEn].every((p) => /^\d+$/.test(p))) return null;
  if (Number(venceEn) < Date.now() / 1000) return null;
  if (!igualesEnTiempoConstante(firma, await firmar(`${usuarioId}.${versionSesion}.${venceEn}`))) return null;
  return { usuarioId: Number(usuarioId), versionSesion: Number(versionSesion) };
}
