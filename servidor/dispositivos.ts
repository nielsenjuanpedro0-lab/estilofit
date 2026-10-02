import { createHash, randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos } from "@/db/esquema";

// Sin 0/O ni 1/I: el código se tipea a mano en un celular.
const ALFABETO_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LARGO_CODIGO = 8;
const VIGENCIA_CODIGO_MS = 15 * 60 * 1000;

// En la base solo quedan hashes. Un token de 32 bytes aleatorios no necesita sal ni hash lento.
function hashear(secreto: string) {
  return createHash("sha256").update(secreto).digest("hex");
}

// Lo que tipea la persona: puede venir en minúsculas, con espacios o con el guion que mostramos.
function normalizarCodigo(codigo: string) {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export async function crearDispositivo(nombre: string) {
  const codigo = Array.from({ length: LARGO_CODIGO }, () => ALFABETO_CODIGO.charAt(randomInt(ALFABETO_CODIGO.length))).join("");
  const [dispositivo] = await db()
    .insert(dispositivos)
    .values({
      nombre,
      codigoAltaHash: hashear(codigo),
      codigoAltaVenceAt: new Date(Date.now() + VIGENCIA_CODIGO_MS),
    })
    .returning({ id: dispositivos.id, codigoAltaVenceAt: dispositivos.codigoAltaVenceAt });
  if (!dispositivo) throw new Error("No se creó el dispositivo");
  // El código se muestra una sola vez y no se puede recuperar después.
  return { id: dispositivo.id, codigo: `${codigo.slice(0, 4)}-${codigo.slice(4)}`, venceAt: dispositivo.codigoAltaVenceAt };
}

// Un solo UPDATE condicional: si dos celulares canjean el mismo código a la vez, gana uno.
export async function canjearCodigo(codigo: string) {
  const token = randomBytes(32).toString("base64url");
  const [dispositivo] = await db()
    .update(dispositivos)
    .set({ tokenHash: hashear(token), codigoAltaHash: null, codigoAltaVenceAt: null, enroladoAt: new Date() })
    .where(
      and(
        eq(dispositivos.codigoAltaHash, hashear(normalizarCodigo(codigo))),
        gt(dispositivos.codigoAltaVenceAt, new Date()),
        isNull(dispositivos.revocadoAt),
      ),
    )
    .returning({ id: dispositivos.id, nombre: dispositivos.nombre });
  if (!dispositivo) return null;
  return { token, dispositivo };
}

export async function autenticarDispositivo(autorizacion: string | null) {
  const token = autorizacion?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return null;
  const [dispositivo] = await db()
    .update(dispositivos)
    .set({ ultimoContactoAt: new Date() })
    .where(and(eq(dispositivos.tokenHash, hashear(token)), isNull(dispositivos.revocadoAt)))
    .returning({ id: dispositivos.id, nombre: dispositivos.nombre });
  return dispositivo ?? null;
}

export async function revocarDispositivo(id: number) {
  await db().update(dispositivos).set({ revocadoAt: new Date(), codigoAltaHash: null }).where(eq(dispositivos.id, id));
}
