import { cookies } from "next/headers";

// Acceso al panel: una sola clave de administrador y una cookie firmada con HMAC.
// Sin usuarios ni permisos: eso es Fase 2. Usa Web Crypto porque también corre en el middleware.

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

export async function claveDePanelCorrecta(intento: string) {
  const clave = process.env.CLAVE_PANEL;
  if (!clave) throw new Error("Falta CLAVE_PANEL en .env.local");
  // Se comparan las firmas y no las claves, así el largo de la clave real no se filtra por tiempo.
  return igualesEnTiempoConstante(await firmar(intento), await firmar(clave));
}

export async function crearValorDeSesion() {
  const venceEn = Math.floor(Date.now() / 1000) + DURACION_SESION_S;
  return `${venceEn}.${await firmar(String(venceEn))}`;
}

export async function sesionValida(valor: string | undefined) {
  if (!valor) return false;
  const [venceEn, firma] = valor.split(".");
  if (!venceEn || !firma || !/^\d+$/.test(venceEn)) return false;
  if (Number(venceEn) < Date.now() / 1000) return false;
  return igualesEnTiempoConstante(firma, await firmar(venceEn));
}

// El middleware ya redirige a quien no tiene sesión, pero una server action es un POST que se puede
// armar a mano: cada acción del panel vuelve a chequear.
export async function exigirSesionPanel() {
  const valor = (await cookies()).get(COOKIE_SESION)?.value;
  if (!(await sesionValida(valor))) throw new Error("La sesión del panel venció. Volvé a ingresar con la clave.");
}
