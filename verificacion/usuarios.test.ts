import { pbkdf2Sync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearValorDeSesion } from "@/servidor/sesion-panel";
import { autenticarConClave, crearUsuario, usuarioDeSesion, vendedoresHabilitados } from "@/servidor/usuarios";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

const cookie = vi.hoisted(() => {
  const sesion: { valor: string | undefined } = { valor: undefined };
  return sesion;
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { cambiarActivoUsuarioAccion, cambiarClaveDeUsuarioAccion, crearUsuarioAccion, editarUsuarioAccion } = await import("@/app/panel/acciones-usuarios");

let b: Awaited<ReturnType<typeof levantarBaseEmbebida>>;
const CLAVE = "una-clave-larga-de-prueba";

beforeEach(async () => {
  b = await levantarBaseEmbebida();
});
afterEach(async () => {
  await b.cerrar();
});

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

async function admin() {
  const usuario = await crearUsuario({ nombre: "Martín", email: "Martin@Estilofit.com.ar", rol: "administrador", clave: CLAVE, pin: null });
  cookie.valor = await crearValorDeSesion(usuario.id, usuario.versionSesion);
  return usuario;
}

describe("usuarios", () => {
  it("guarda solo hashes y autentica por email sin importar mayúsculas", async () => {
    const usuario = await admin();
    const fila = await b.consultarUno<{ clave_hash: string; email: string }>("select clave_hash, email from usuarios where id = $1", [usuario.id]);
    expect(fila.email).toBe("martin@estilofit.com.ar");
    expect(fila.clave_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(fila.clave_hash).not.toContain(CLAVE);

    expect((await autenticarConClave("MARTIN@estilofit.com.ar", CLAVE))?.id).toBe(usuario.id);
    expect(await autenticarConClave("martin@estilofit.com.ar", "otra-clave-cualquiera")).toBeNull();
    expect(await autenticarConClave("nadie@estilofit.com.ar", CLAVE)).toBeNull();
  });

  it("un vendedor no entra al panel aunque tenga clave, y el PIN se puede verificar con PBKDF2", async () => {
    const vendedor = await crearUsuario({ nombre: "Nico", email: "nico@estilofit.com.ar", rol: "vendedor", clave: CLAVE, pin: "4321" });
    expect(await autenticarConClave("nico@estilofit.com.ar", CLAVE)).toBeNull();
    expect(await usuarioDeSesion(vendedor.id, vendedor.versionSesion)).toBeNull();

    const [habilitado] = await vendedoresHabilitados();
    const [, iteraciones, sal, hash] = (habilitado?.pinHash ?? "").split("$");
    expect(pbkdf2Sync("4321", Buffer.from(sal ?? "", "hex"), Number(iteraciones), 32, "sha256").toString("hex")).toBe(hash);
    expect(pbkdf2Sync("1111", Buffer.from(sal ?? "", "hex"), Number(iteraciones), 32, "sha256").toString("hex")).not.toBe(hash);
  });

  it("rechaza datos incompletos según el rol", async () => {
    await admin();
    expect(await crearUsuarioAccion(null, formulario({ nombre: "Ana", email: "", rol: "encargado", clave: CLAVE, pin: "" }))).toEqual({
      error: "Para entrar al panel hace falta un email.",
    });
    expect(await crearUsuarioAccion(null, formulario({ nombre: "Ana", email: "ana@x.com", rol: "encargado", clave: "corta", pin: "" }))).toMatchObject({
      error: expect.stringMatching(/al menos 10/),
    });
    expect(await crearUsuarioAccion(null, formulario({ nombre: "Flor", email: "", rol: "vendedor", clave: "", pin: "12" }))).toEqual({
      error: "El PIN tiene que ser de 4 números.",
    });
    expect(await crearUsuarioAccion(null, formulario({ nombre: "Flor", email: "", rol: "vendedor", clave: "", pin: "1234" }))).toEqual({
      exito: "Se creó a Flor",
    });
    expect(await crearUsuarioAccion(null, formulario({ nombre: "Otro", email: "MARTIN@estilofit.com.ar", rol: "consulta", clave: CLAVE, pin: "" }))).toMatchObject({
      error: expect.stringMatching(/Ya hay un usuario/),
    });
  });

  it("siempre queda un administrador activo, y nadie se desactiva a sí mismo", async () => {
    const yo = await admin();
    expect(await cambiarActivoUsuarioAccion(yo.id, false)).toEqual({ error: "No te podés desactivar a vos mismo." });
    expect(await editarUsuarioAccion(yo.id, null, formulario({ nombre: "Martín", email: "martin@estilofit.com.ar", rol: "consulta" }))).toMatchObject({
      error: expect.stringMatching(/único administrador/),
    });
  });

  it("cambiar la clave o desactivar cierra las sesiones abiertas de ese usuario", async () => {
    const yo = await admin();
    const otro = await crearUsuario({ nombre: "Lucía", email: "lucia@estilofit.com.ar", rol: "encargado", clave: CLAVE, pin: null });
    expect(await usuarioDeSesion(otro.id, otro.versionSesion)).not.toBeNull();

    await cambiarClaveDeUsuarioAccion(otro.id, null, formulario({ clave: "otra-clave-larga-nueva" }));
    expect(await usuarioDeSesion(otro.id, otro.versionSesion)).toBeNull();
    expect(await usuarioDeSesion(otro.id, otro.versionSesion + 1)).not.toBeNull();

    await cambiarActivoUsuarioAccion(otro.id, false);
    expect(await usuarioDeSesion(otro.id, otro.versionSesion + 2)).toBeNull();
    expect(await usuarioDeSesion(yo.id, yo.versionSesion)).not.toBeNull();

    const auditoria = await b.consultar<{ detalle: string }>("select detalle from auditoria order by id");
    expect(auditoria.map((a) => a.detalle)).toEqual(["Cambió la clave de Lucía", "Desactivó a Lucía"]);
    expect(JSON.stringify(auditoria)).not.toContain("otra-clave-larga-nueva");
  });
});
