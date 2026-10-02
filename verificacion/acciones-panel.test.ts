import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearValorDeSesion } from "@/servidor/sesion-panel";
import { prepararEscenario } from "@/verificacion/escenario";

// Las server actions del panel corren tal cual. Lo único simulado es lo que solo existe dentro de
// un pedido de Next: la cookie de sesión y la invalidación de caché.
const cookie = vi.hoisted(() => {
  const sesion: { valor: string | undefined } = { valor: undefined };
  return sesion;
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { transferirAccion } = await import("@/app/panel/acciones");

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;
let showroom: number;

beforeEach(async () => {
  process.env.SECRETO_SESION = "secreto-de-prueba-de-al-menos-32-caracteres";
  cookie.valor = await crearValorDeSesion();
  e = await prepararEscenario();
  ({ id: showroom } = await e.b.consultarUno<{ id: number }>("select id from ubicaciones where nombre = 'Showroom Tandil'"));
});
afterEach(async () => {
  await e.b.cerrar();
});

async function stockEn(ubicacionId: number, varianteId: number) {
  const filas = await e.b.consultar<{ cantidad: number }>("select cantidad from stock_actual where ubicacion_id = $1 and variante_id = $2", [
    ubicacionId,
    varianteId,
  ]);
  return filas[0]?.cantidad ?? 0;
}

describe("transferencias desde el panel", () => {
  it("mueve del depósito al showroom y suma en un renglón la misma variante cargada dos veces", async () => {
    const v = e.llevadas[3];
    if (!v) throw new Error("Escenario incompleto");
    const antes = { deposito: await stockEn(e.deposito.id, v.id), showroom: await stockEn(showroom, v.id) };

    const resultado = await transferirAccion(e.deposito.id, showroom, [
      { varianteId: v.id, cantidad: 1 },
      { varianteId: v.id, cantidad: 1 },
    ]);

    expect(resultado).toEqual({ ok: true, unidades: 2 });
    expect(await stockEn(e.deposito.id, v.id)).toBe(antes.deposito - 2);
    expect(await stockEn(showroom, v.id)).toBe(antes.showroom + 2);
    const { n } = await e.b.consultarUno<{ n: number }>(
      "select count(*)::int as n from movimientos where tipo = 'transferencia' and ubicacion_destino_id = $1 and variante_id = $2 and nota like 'Transferencia de%'",
      [showroom, v.id],
    );
    expect(n).toBe(1);
  });

  it("si falta stock no mueve nada y dice qué producto, talle y color bajar", async () => {
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    const resultado = await transferirAccion(e.evento.ubicacionId, showroom, [{ varianteId: v.id, cantidad: 99 }]);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(new RegExp(`${v.talle}.*pediste 99, hay 2`));
  });

  it("no mueve nada hacia un evento cerrado", async () => {
    await e.b.consultar("update eventos set estado = 'cerrado' where id = $1", [e.evento.id]);
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    expect(await transferirAccion(e.deposito.id, e.evento.ubicacionId, [{ varianteId: v.id, cantidad: 1 }])).toEqual({
      ok: false,
      error: "Uno de los dos es un evento cerrado: su stock ya volvió al depósito.",
    });
  });

  it("sin sesión del panel no hace nada", async () => {
    cookie.valor = undefined;
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    await expect(transferirAccion(e.deposito.id, showroom, [{ varianteId: v.id, cantidad: 1 }])).rejects.toThrow(/sesión del panel venció/);
  });
});
