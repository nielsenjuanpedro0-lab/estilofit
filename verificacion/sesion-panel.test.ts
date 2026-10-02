import { beforeEach, describe, expect, it } from "vitest";
import { claveDePanelCorrecta, crearValorDeSesion, sesionValida } from "@/servidor/sesion-panel";

beforeEach(() => {
  process.env.SECRETO_SESION = "secreto-de-prueba-de-al-menos-32-caracteres";
  process.env.CLAVE_PANEL = "clave-de-prueba";
});

describe("sesión del panel", () => {
  it("acepta solo la clave configurada", async () => {
    expect(await claveDePanelCorrecta("clave-de-prueba")).toBe(true);
    expect(await claveDePanelCorrecta("clave-de-prueb")).toBe(false);
    expect(await claveDePanelCorrecta("")).toBe(false);
  });

  it("valida la cookie firmada y rechaza una adulterada o vencida", async () => {
    const valor = await crearValorDeSesion();
    expect(await sesionValida(valor)).toBe(true);

    const [venceEn, firma] = valor.split(".");
    expect(await sesionValida(`${Number(venceEn) + 3600}.${firma}`)).toBe(false);
    expect(await sesionValida(`${venceEn}.${firma}x`)).toBe(false);
    expect(await sesionValida(undefined)).toBe(false);
    expect(await sesionValida("basura")).toBe(false);

    const vencida = Math.floor(Date.now() / 1000) - 1;
    process.env.SECRETO_SESION = "otro-secreto-de-al-menos-32-caracteres!!";
    expect(await sesionValida(valor)).toBe(false);
    expect(await sesionValida(`${vencida}.${firma}`)).toBe(false);
  });
});
