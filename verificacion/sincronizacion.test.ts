import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { stockActual, ventas } from "@/db/esquema";
import { revocarDispositivo } from "@/servidor/dispositivos";
import { uuidDeRenglon } from "@/servidor/sincronizacion";
import { UNIDADES_POR_VARIANTE, prepararEscenario, subir, subirOk, ventaDePrueba } from "@/verificacion/escenario";

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

// Solo lo del evento del escenario: la semilla ya trae ventas de otro evento.
async function contar(que: "ventas" | "renglones" | "movimientos de venta") {
  const consultas = {
    ventas: "select count(*)::int as n from ventas where evento_id = $1",
    renglones: "select count(*)::int as n from venta_items vi join ventas v on v.id = vi.venta_id where v.evento_id = $1",
    "movimientos de venta":
      "select count(*)::int as n from movimientos m join eventos ev on ev.ubicacion_id = m.ubicacion_origen_id where m.tipo = 'venta' and ev.id = $1",
  };
  const { n } = await e.b.consultarUno<{ n: number }>(consultas[que], [e.evento.id]);
  return n;
}

async function stockEnEvento(varianteId: number) {
  const [fila] = await e.b.base
    .select({ cantidad: stockActual.cantidad })
    .from(stockActual)
    .where(and(eq(stockActual.ubicacionId, e.evento.ubicacionId), eq(stockActual.varianteId, varianteId)));
  if (!fila) throw new Error(`La variante ${varianteId} no tiene fila de stock en el evento`);
  return fila.cantidad;
}

describe("sincronización idempotente", () => {
  it("el mismo lote mandado diez veces deja una venta por client_uuid, un renglón por item y un movimiento por renglón", async () => {
    const lote = [
      ventaDePrueba(e.evento.id, [
        { varianteId: variante(0).id, cantidad: 1, precio: variante(0).precio },
        { varianteId: variante(1).id, cantidad: 2, precio: variante(1).precio },
      ]),
      ventaDePrueba(e.evento.id, [{ varianteId: variante(2).id, cantidad: 1, precio: variante(2).precio }], { medioPago: "tarjeta" }),
      ventaDePrueba(e.evento.id, [{ varianteId: variante(3).id, cantidad: 1, precio: variante(3).precio }], { medioPago: "transferencia" }),
    ];

    for (let intento = 0; intento < 10; intento++) {
      const respuesta = await subirOk(e.tokenA, lote);
      expect(respuesta.confirmadas.sort()).toEqual(lote.map((v) => v.clientUuid).sort());
      expect(respuesta.rechazadas).toEqual([]);
    }

    expect(await contar("ventas")).toBe(3);
    expect(await contar("renglones")).toBe(4);
    expect(await contar("movimientos de venta")).toBe(4);
    const uuidsDeMovimientos = await e.b.consultar<{ client_uuid: string }>(
      "select client_uuid from movimientos where tipo = 'venta' and ubicacion_origen_id = $1",
      [e.evento.ubicacionId],
    );
    const primera = lote[0];
    if (!primera) throw new Error("Lote vacío");
    expect(uuidsDeMovimientos.map((m) => m.client_uuid)).toContain(uuidDeRenglon(primera.clientUuid, 1));
    expect(await stockEnEvento(variante(1).id)).toBe(UNIDADES_POR_VARIANTE - 2);
    expect(await e.b.consultar("select * from verificar_stock_actual()")).toEqual([]);
  });

  it("rechaza una venta con una variante inexistente sin romper el lote", async () => {
    const buena1 = ventaDePrueba(e.evento.id, [{ varianteId: variante(0).id, cantidad: 1, precio: variante(0).precio }]);
    const rota = ventaDePrueba(e.evento.id, [{ varianteId: 999_999, cantidad: 1, precio: 1000 }]);
    const invalida = { ...ventaDePrueba(e.evento.id, [{ varianteId: variante(1).id, cantidad: 1, precio: 1 }]), items: [] };
    const buena2 = ventaDePrueba(e.evento.id, [{ varianteId: variante(1).id, cantidad: 1, precio: variante(1).precio }]);

    const respuesta = await subirOk(e.tokenA, [buena1, rota, invalida, buena2]);

    expect(respuesta.confirmadas.sort()).toEqual([buena1.clientUuid, buena2.clientUuid].sort());
    expect(respuesta.rechazadas.map((r) => r.clientUuid).sort()).toEqual([rota.clientUuid, invalida.clientUuid].sort());
    expect(respuesta.rechazadas.find((r) => r.clientUuid === rota.clientUuid)?.motivo).toMatch(/999999/);
    expect(await contar("ventas")).toBe(2);
  });

  it("sin token válido responde 401 y no registra nada", async () => {
    const venta = ventaDePrueba(e.evento.id, [{ varianteId: variante(0).id, cantidad: 1, precio: variante(0).precio }]);
    expect((await subir(null, [venta])).status).toBe(401);
    expect((await subir("token-inventado", [venta])).status).toBe(401);

    const { id } = await e.b.consultarUno<{ id: number }>("select id from dispositivos where nombre = 'Celular A'");
    await revocarDispositivo(id);
    expect((await subir(e.tokenA, [venta])).status).toBe(401);
    expect(await contar("ventas")).toBe(0);
  });

  it("guarda los dos timestamps y acepta un reloj de dispositivo corrido", async () => {
    const venta = ventaDePrueba(e.evento.id, [{ varianteId: variante(0).id, cantidad: 1, precio: variante(0).precio }], {
      vendidoAt: "2031-01-01T12:00:00-03:00",
    });
    await subirOk(e.tokenA, [venta]);

    const [guardada] = await e.b.base.select().from(ventas).where(eq(ventas.clientUuid, venta.clientUuid));
    expect(guardada?.vendidoAt.toISOString()).toBe("2031-01-01T15:00:00.000Z");
    expect(Math.abs((guardada?.recibidoAt.getTime() ?? 0) - Date.now())).toBeLessThan(60_000);
  });
});

describe("precio y casos con plata cobrada", () => {
  it("acepta redondeo a la baja en efectivo dentro del tope sin marcar revisión", async () => {
    process.env.TOPE_REDONDEO_EFECTIVO = "1000";
    const v = variante(11);
    const venta = ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }], { total: v.precio - 500 });
    await subirOk(e.tokenA, [venta]);

    const [guardada] = await e.b.base.select().from(ventas).where(eq(ventas.clientUuid, venta.clientUuid));
    expect(guardada).toMatchObject({ total: v.precio - 500, totalCatalogo: v.precio, paraRevisar: false });
  });

  it("acepta pero marca para revisión una diferencia fuera de tope, con tarjeta o a favor", async () => {
    process.env.TOPE_REDONDEO_EFECTIVO = "1000";
    const v = variante(11);
    const casos = [
      ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }], { total: v.precio - 5000 }),
      ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }], { total: v.precio - 100, medioPago: "tarjeta" }),
      ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }], { total: v.precio + 100 }),
    ];
    const respuesta = await subirOk(e.tokenA, casos);
    expect(respuesta.confirmadas).toHaveLength(3);

    const guardadas = await e.b.base.select().from(ventas).where(eq(ventas.eventoId, e.evento.id));
    expect(guardadas).toHaveLength(3);
    for (const g of guardadas) {
      expect(g.paraRevisar).toBe(true);
      expect(g.totalCatalogo).toBe(v.precio);
      expect(g.motivoRevision).toMatch(/cobró/);
    }
  });

  it("acepta una venta de un evento ya cerrado y la marca para revisión", async () => {
    await e.b.consultar("update eventos set estado = 'cerrado' where id = $1", [e.evento.id]);
    const venta = ventaDePrueba(e.evento.id, [{ varianteId: variante(0).id, cantidad: 1, precio: variante(0).precio }]);
    expect((await subirOk(e.tokenA, [venta])).confirmadas).toEqual([venta.clientUuid]);

    const [guardada] = await e.b.base.select().from(ventas).where(eq(ventas.clientUuid, venta.clientUuid));
    expect(guardada?.paraRevisar).toBe(true);
    expect(guardada?.motivoRevision).toMatch(/evento ya cerrado/);
  });

  it("dos dispositivos venden la última unidad: entran las dos y el stock del evento queda negativo", async () => {
    const v = variante(0);
    // El evento tiene 2: el celular A vende 1 y después los dos venden "la última".
    await subirOk(e.tokenA, [ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: UNIDADES_POR_VARIANTE - 1, precio: v.precio }])]);
    const deA = ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }]);
    const deB = ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }]);
    await Promise.all([subirOk(e.tokenA, [deA]), subirOk(e.tokenB, [deB])]);

    expect(await contar("ventas")).toBe(3);
    expect(await stockEnEvento(v.id)).toBe(-1);
    expect(await e.b.consultar("select * from verificar_stock_actual()")).toEqual([]);
    const dispositivos = await e.b.consultar<{ device_id: number }>("select distinct device_id from ventas where evento_id = $1", [e.evento.id]);
    expect(dispositivos).toHaveLength(2);
  });
});
