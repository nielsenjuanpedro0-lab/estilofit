import { almacen, type Vendedor } from "@/celular/almacen";

// Quién vende en este celular. El PIN se verifica sin señal contra el hash que vino en el paquete:
// es la misma cuenta PBKDF2 que hace servidor/usuarios.ts al guardarlo. Identifica, no protege:
// la seguridad del celular es su token.

function aHexadecimal(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function desdeHexadecimal(hex: string) {
  return new Uint8Array((hex.match(/.{2}/g) ?? []).map((par) => parseInt(par, 16)));
}

export async function pinCorrecto(pin: string, pinHash: string) {
  const [algoritmo, iteraciones, sal, hash] = pinHash.split("$");
  if (algoritmo !== "pbkdf2" || !iteraciones || !sal || !hash) throw new Error("El PIN guardado tiene un formato desconocido");
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: desdeHexadecimal(sal), iterations: Number(iteraciones) }, clave, 256);
  return aHexadecimal(bits) === hash;
}

export async function empezarTurno(vendedor: Vendedor, pin: string) {
  if (!(await pinCorrecto(pin, vendedor.pinHash))) return false;
  await almacen.turno.put({ id: 1, vendedorId: vendedor.id, nombre: vendedor.nombre, desde: Date.now() });
  return true;
}

export async function terminarTurno() {
  await almacen.turno.delete(1);
}
