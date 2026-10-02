import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { eventos } from "@/db/esquema";
import { cerrarEvento } from "@/servidor/cierre";
import { crearEvento, resumenDeEventos } from "@/servidor/eventos";
import { transferir } from "@/servidor/transferencias";
import { UNIDADES_POR_VARIANTE, prepararEscenario, subirOk, ventaDePrueba } from "@/verificacion/escenario";

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;

beforeEach(async () => {
  e = await prepararEscenario();
});
afterEach(async () => {
  await e.b.cerrar();
});

function variante(i: number) {
  const v = e.llevadas[i];
  if (!v) throw new Error(`El escenario no tiene la variante ${i}`);
  return v;
}

async function stockEn(ubicacionId: number, varianteId: number) {
  const filas = await e.b.consultar<{ cantidad: number }>("select cantidad from stock_actual where ubicacion_id = $1 and variante_id = $2", [
    ubicacionId,
    varianteId,
  ]);
  return filas[0]?.cantidad ?? 0;
}

// El conteo "perfecto": vuelve exactamente lo que el libro mayor dice que debería haber.
async function conteoSegunLibro() {
  return e.b.consultar<{ varianteId: number; contadas: number }>(
    `select variante_id as "varianteId", greatest(cantidad, 0) as contadas from stock_segun_movimientos where ubicacion_id = $1`,
    [e.evento.ubicacionId],
  );
}

async function resumen(eventoId: number) {
  const [fila] = await resumenDeEventos(eq(eventos.id, eventoId));
  if (!fila) throw new Error(`Sin resumen para el evento ${eventoId}`);
  return fila;
}

describe("cierre de evento", () => {
  it("detecta una diferencia intencional de 2 unidades, la asienta como ajuste y devuelve el remanente al depósito", async () => {
    const v0 = variante(0);
    const v5 = variante(5);
    await subirOk(e.tokenA, [ventaDePrueba(e.evento.id, [{ varianteId: v0.id, cantidad: 1, precio: v0.precio }])]);
    const depositoAntes = await stockEn(e.deposito.id, v5.id);

    const conteo = (await conteoSegunLibro()).map((c) => (c.varianteId === v5.id ? { ...c, contadas: c.contadas - 2 } : c));
    const resultado = await cerrarEvento(e.evento.id, conteo, e.deposito.id);

    expect(resultado).toEqual({
      ok: true,
      diferencias: [{ varianteId: v5.id, esperadas: UNIDADES_POR_VARIANTE, contadas: UNIDADES_POR_VARIANTE - 2, diferencia: -2 }],
    });
    const ajustes = await e.b.consultar<{ cantidad: number; origen: number | null }>(
      "select cantidad, ubicacion_origen_id as origen from movimientos where tipo = 'ajuste'",
    );
    expect(ajustes).toEqual([{ cantidad: 2, origen: e.evento.ubicacionId }]);
    expect(await stockEn(e.deposito.id, v5.id)).toBe(depositoAntes + UNIDADES_POR_VARIANTE - 2);
    expect(await stockEn(e.evento.ubicacionId, v0.id)).toBe(0);
    expect(await stockEn(e.evento.ubicacionId, v5.id)).toBe(0);

    expect(await resumen(e.evento.id)).toMatchObject({
      estado: "cerrado",
      vendidas: 1,
      faltantes: 2,
      sobrantes: 0,
      devueltas: 20 * UNIDADES_POR_VARIANTE - 1 - 2,
    });
    expect(await e.b.consultar("select * from verificar_stock_actual()")).toEqual([]);
  });

  it("dos dispositivos sobrevenden la última unidad y el cierre lo deja asentado como ajuste", async () => {
    const v = variante(0);
    await subirOk(e.tokenA, [ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: UNIDADES_POR_VARIANTE - 1, precio: v.precio }])]);
    await subirOk(e.tokenA, [ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }])]);
    await subirOk(e.tokenB, [ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }])]);
    expect(await stockEn(e.evento.ubicacionId, v.id)).toBe(-1);

    const resultado = await cerrarEvento(e.evento.id, await conteoSegunLibro(), e.deposito.id);

    expect(resultado.ok && resultado.diferencias).toEqual([{ varianteId: v.id, esperadas: -1, contadas: 0, diferencia: 1 }]);
    const ajustes = await e.b.consultar<{ cantidad: number; destino: number | null; nota: string }>(
      "select cantidad, ubicacion_destino_id as destino, nota from movimientos where tipo = 'ajuste'",
    );
    expect(ajustes).toEqual([{ cantidad: 1, destino: e.evento.ubicacionId, nota: "Cierre: sobrante. Esperadas -1, contadas 0" }]);
    expect(await stockEn(e.evento.ubicacionId, v.id)).toBe(0);
  });

  it("no deja cerrar dos veces el mismo evento, ni siquiera en simultáneo", async () => {
    const conteo = await conteoSegunLibro();
    const resultados = await Promise.all([
      cerrarEvento(e.evento.id, conteo, e.deposito.id),
      cerrarEvento(e.evento.id, conteo, e.deposito.id),
    ]);
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    const { n: antes } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from movimientos");

    const tercero = await cerrarEvento(e.evento.id, conteo, e.deposito.id);
    expect(tercero).toEqual({ ok: false, motivo: "Este evento ya está cerrado. Un evento se cierra una sola vez." });
    const { n: despues } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from movimientos");
    expect(despues).toBe(antes);
  });

  it("rechaza un conteo incompleto sin tocar nada", async () => {
    const conteo = (await conteoSegunLibro()).slice(1);
    const resultado = await cerrarEvento(e.evento.id, conteo, e.deposito.id);
    expect(resultado).toEqual({ ok: false, motivo: "Faltan contar 1 variantes. Si no volvió ninguna unidad, cargá 0." });
    const [evento] = await e.b.base.select().from(eventos).where(eq(eventos.id, e.evento.id));
    expect(evento?.estado).toBe("abierto");
  });
});

describe("subselects correlacionados", () => {
  it("cada evento cuenta solo lo suyo", async () => {
    // Un segundo equipo de venta: otro evento, con otra ubicación y números distintos.
    const otro = await crearEvento({ nombre: "Segundo equipo", lugar: "Tandil", fechaDesde: "2026-10-17", fechaHasta: "2026-10-18" });
    const v = variante(15);
    const transferencia = await transferir({ origenId: e.deposito.id, destinoId: otro.ubicacionId, items: [{ varianteId: v.id, cantidad: 3 }] });
    expect(transferencia.ok).toBe(true);

    await subirOk(e.tokenA, [
      ventaDePrueba(e.evento.id, [{ varianteId: variante(0).id, cantidad: 2, precio: variante(0).precio }]),
      ventaDePrueba(e.evento.id, [{ varianteId: variante(1).id, cantidad: 1, precio: variante(1).precio }]),
    ]);
    await subirOk(e.tokenB, [ventaDePrueba(otro.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }], { medioPago: "tarjeta" })]);

    expect(await resumen(e.evento.id)).toMatchObject({
      llevadas: 20 * UNIDADES_POR_VARIANTE,
      vendidas: 3,
      ventas: 2,
      facturado: 2 * variante(0).precio + variante(1).precio,
    });
    expect(await resumen(otro.id)).toMatchObject({ llevadas: 3, vendidas: 1, ventas: 1, facturado: v.precio, paraRevisar: 0 });
  });
});
