import { describe, expect, it } from "vitest";
import { claveDeInstalacionCorrecta, crearValorDeSesion, leerSesion } from "@/servidor/sesion-panel";

describe("cookie de sesión del panel", () => {
  it("lleva el usuario y la versión de sesión, y rechaza una adulterada", async () => {
    const valor = await crearValorDeSesion(7, 3);
    expect(await leerSesion(valor)).toEqual({ usuarioId: 7, versionSesion: 3 });

    const [, version, venceEn, firma] = valor.split(".");
    // Otro usuario con la firma de este: no pasa.
    expect(await leerSesion(`8.${version}.${venceEn}.${firma}`)).toBeNull();
    expect(await leerSesion(`7.${Number(version) + 1}.${venceEn}.${firma}`)).toBeNull();
    expect(await leerSesion(`7.${version}.${Number(venceEn) + 3600}.${firma}`)).toBeNull();
    expect(await leerSesion(`${valor}x`)).toBeNull();
    expect(await leerSesion(undefined)).toBeNull();
    expect(await leerSesion("basura")).toBeNull();
  });

  it("rechaza una cookie vencida aunque la firma sea buena", async () => {
    const original = Date.now;
    Date.now = () => original() - 13 * 60 * 60 * 1000;
    const vieja = await crearValorDeSesion(7, 1);
    Date.now = original;
    expect(await leerSesion(vieja)).toBeNull();
  });

  it("la clave de instalación solo acepta la configurada", async () => {
    expect(await claveDeInstalacionCorrecta(process.env.CLAVE_INSTALACION ?? "")).toBe(true);
    expect(await claveDeInstalacionCorrecta("otra")).toBe(false);
  });
});
