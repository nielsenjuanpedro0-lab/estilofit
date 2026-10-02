import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dentroDelLimite, ingresoBloqueado, registrarIngresoFallido } from "@/servidor/limite-velocidad";
import { transferir } from "@/servidor/transferencias";
import { UNIDADES_POR_VARIANTE, prepararEscenario } from "@/verificacion/escenario";

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;

beforeEach(async () => {
  e = await prepararEscenario();
});
afterEach(async () => {
  await e.b.cerrar();
});

async function contarMovimientos() {
  const { n } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from movimientos");
  return n;
}

describe("transferencias", () => {
  it("rechaza la transferencia entera si a un solo renglón le falta stock en el origen", async () => {
    const [alcanza, noAlcanza] = e.llevadas;
    if (!alcanza || !noAlcanza) throw new Error("Escenario incompleto");
    const antes = await contarMovimientos();

    const resultado = await transferir({
      origenId: e.evento.ubicacionId,
      destinoId: e.deposito.id,
      items: [
        { varianteId: alcanza.id, cantidad: 1 },
        { varianteId: noAlcanza.id, cantidad: UNIDADES_POR_VARIANTE + 1 },
      ],
    });

    expect(resultado).toEqual({
      ok: false,
      faltantes: [{ varianteId: noAlcanza.id, pedido: UNIDADES_POR_VARIANTE + 1, disponible: UNIDADES_POR_VARIANTE }],
    });
    expect(await contarMovimientos()).toBe(antes);
  });

  it("una variante que nunca estuvo en el origen cuenta como disponible cero", async () => {
    const { id } = await e.b.consultarUno<{ id: number }>("select max(id) as id from variantes");
    const resultado = await transferir({ origenId: e.evento.ubicacionId, destinoId: e.deposito.id, items: [{ varianteId: id, cantidad: 1 }] });
    expect(resultado).toEqual({ ok: false, faltantes: [{ varianteId: id, pedido: 1, disponible: 0 }] });
  });
});

describe("límite de intentos al panel", () => {
  it("bloquea una IP al quinto intento fallido y la libera a los quince minutos", () => {
    const inicio = 5_000_000;
    for (let i = 0; i < 4; i++) registrarIngresoFallido("10.0.0.1", inicio + i);
    expect(ingresoBloqueado("10.0.0.1", inicio + 10)).toBe(false);
    registrarIngresoFallido("10.0.0.1", inicio + 11);
    expect(ingresoBloqueado("10.0.0.1", inicio + 12)).toBe(true);
    expect(ingresoBloqueado("10.0.0.2", inicio + 12)).toBe(false);
    expect(ingresoBloqueado("10.0.0.1", inicio + 15 * 60_000)).toBe(false);
  });
});

describe("límite de velocidad", () => {
  it("corta al pedido 61 dentro del mismo minuto y se libera al minuto siguiente", () => {
    const inicio = 1_000_000;
    for (let i = 0; i < 60; i++) expect(dentroDelLimite(4242, inicio + i)).toBe(true);
    expect(dentroDelLimite(4242, inicio + 100)).toBe(false);
    expect(dentroDelLimite(4243, inicio + 100)).toBe(true);
    expect(dentroDelLimite(4242, inicio + 60_000)).toBe(true);
  });
});
