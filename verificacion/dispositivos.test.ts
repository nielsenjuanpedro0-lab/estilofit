import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as alta } from "@/app/api/dispositivos/alta/route";
import { autenticarDispositivo, crearDispositivo, revocarDispositivo } from "@/servidor/dispositivos";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

type Base = Awaited<ReturnType<typeof levantarBaseEmbebida>>;
let b: Base;

beforeEach(async () => {
  b = await levantarBaseEmbebida();
});
afterEach(async () => {
  await b.cerrar();
});

function pedirAlta(cuerpo: unknown) {
  return alta(
    new Request("http://localhost/api/dispositivos/alta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    }),
  );
}

async function leerToken(respuesta: Response) {
  const cuerpo: unknown = await respuesta.json();
  if (typeof cuerpo !== "object" || cuerpo === null || !("token" in cuerpo) || typeof cuerpo.token !== "string") {
    throw new Error(`La respuesta no trae token: ${JSON.stringify(cuerpo)}`);
  }
  return cuerpo.token;
}

describe("enrolamiento de dispositivos", () => {
  it("canjea el código una sola vez por un token de 32 bytes, y en la base queda solo el hash", async () => {
    const { codigo } = await crearDispositivo("Celular equipo 1");

    const primera = await pedirAlta({ codigo: codigo.toLowerCase() });
    expect(primera.status).toBe(200);
    const token = await leerToken(primera);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);

    const segunda = await pedirAlta({ codigo });
    expect(segunda.status).toBe(401);

    const filas = await b.consultar<Record<string, unknown>>("select * from dispositivos");
    const volcado = JSON.stringify(filas);
    expect(volcado).not.toContain(token);
    expect(volcado).not.toContain(codigo.replace("-", ""));
  });

  it("rechaza un código vencido", async () => {
    const { codigo } = await crearDispositivo("Celular equipo 2");
    await b.consultar("update dispositivos set codigo_alta_vence_at = now() - interval '1 minute'");
    expect((await pedirAlta({ codigo })).status).toBe(401);
  });

  it("rechaza cuerpos inválidos con 400", async () => {
    expect((await pedirAlta({})).status).toBe(400);
    expect((await pedirAlta({ codigo: 12345678 })).status).toBe(400);
  });

  it("autentica con Bearer y deja de autenticar al revocar", async () => {
    const { id, codigo } = await crearDispositivo("Celular equipo 1");
    const token = await leerToken(await pedirAlta({ codigo }));

    expect(await autenticarDispositivo(`Bearer ${token}`)).toEqual({ id, nombre: "Celular equipo 1" });
    expect(await autenticarDispositivo(null)).toBeNull();
    expect(await autenticarDispositivo(`Bearer ${token}x`)).toBeNull();
    expect(await autenticarDispositivo(token)).toBeNull();

    await revocarDispositivo(id);
    expect(await autenticarDispositivo(`Bearer ${token}`)).toBeNull();
  });
});
