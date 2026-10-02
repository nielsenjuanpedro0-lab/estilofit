import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asc } from "drizzle-orm";
import { movimientos, productos, stockActual, ubicaciones, variantes } from "@/db/esquema";
import { recalcularStock, verificarStock } from "@/servidor/libro-mayor";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

type Base = Awaited<ReturnType<typeof levantarBaseEmbebida>>;
type Descuadre = { variante_id: number; ubicacion_id: number; materializado: number | null; segun_movimientos: number | null };

let b: Base;
let varianteId: number;
let deposito: number;
let evento: number;

beforeEach(async () => {
  b = await levantarBaseEmbebida();
  const [producto] = await b.base
    .insert(productos)
    .values({ nombre: "Media de compresión", marca: "Compressport", categoria: "Medias" })
    .returning();
  if (!producto) throw new Error("No se insertó el producto");
  const [variante] = await b.base
    .insert(variantes)
    .values({ productoId: producto.id, sku: "801", talle: "39-42", color: "Negro", precio: 28000 })
    .returning();
  if (!variante) throw new Error("No se insertó la variante");
  varianteId = variante.id;
  const filas = await b.base
    .insert(ubicaciones)
    .values([
      { nombre: "Depósito", tipo: "deposito" },
      { nombre: "Evento de prueba", tipo: "evento" },
    ])
    .returning();
  const [dep, ev] = filas;
  if (!dep || !ev) throw new Error("No se insertaron las ubicaciones");
  deposito = dep.id;
  evento = ev.id;
});

afterEach(async () => {
  await b.cerrar();
});

const ocurridoAt = new Date("2026-09-12T10:00:00-03:00");

async function cargarMovimientosDeEjemplo() {
  await b.base.insert(movimientos).values([
    { varianteId, ubicacionDestinoId: deposito, cantidad: 10, tipo: "carga_inicial", ocurridoAt },
    { varianteId, ubicacionOrigenId: deposito, ubicacionDestinoId: evento, cantidad: 3, tipo: "transferencia", ocurridoAt },
    { varianteId, ubicacionOrigenId: evento, cantidad: 1, tipo: "venta", ocurridoAt },
  ]);
}

describe("libro mayor de stock", () => {
  it("el trigger materializa stock_actual y coincide con el libro mayor", async () => {
    await cargarMovimientosDeEjemplo();

    const stock = await b.base.select().from(stockActual).orderBy(asc(stockActual.ubicacionId));
    expect(stock).toEqual([
      { varianteId, ubicacionId: deposito, cantidad: 7 },
      { varianteId, ubicacionId: evento, cantidad: 2 },
    ]);
    expect(await b.consultar<Descuadre>("select * from verificar_stock_actual()")).toEqual([]);
  });

  it("UPDATE y DELETE sobre movimientos fallan", async () => {
    await cargarMovimientosDeEjemplo();

    await expect(b.consultar("update movimientos set cantidad = 99")).rejects.toThrow(/no se modifican ni se borran/);
    await expect(b.consultar("delete from movimientos")).rejects.toThrow(/no se modifican ni se borran/);
    const { total } = await b.consultarUno<{ total: number }>("select count(*)::int as total from movimientos");
    expect(total).toBe(3);
  });

  it("rechaza cantidad negativa o cero", async () => {
    const insertar = (cantidad: number) =>
      b.consultar(
        "insert into movimientos (variante_id, ubicacion_destino_id, cantidad, tipo, ocurrido_at) values ($1, $2, $3, 'ajuste', now())",
        [varianteId, deposito, cantidad],
      );
    await expect(insertar(-1)).rejects.toThrow(/movimientos_cantidad_positiva/);
    await expect(insertar(0)).rejects.toThrow(/movimientos_cantidad_positiva/);
  });

  it("rechaza un movimiento sin origen ni destino, o con origen igual a destino", async () => {
    await expect(
      b.consultar("insert into movimientos (variante_id, cantidad, tipo, ocurrido_at) values ($1, 1, 'ajuste', now())", [varianteId]),
    ).rejects.toThrow(/movimientos_con_origen_o_destino/);
    await expect(
      b.consultar(
        "insert into movimientos (variante_id, ubicacion_origen_id, ubicacion_destino_id, cantidad, tipo, ocurrido_at) values ($1, $2, $2, 1, 'transferencia', now())",
        [varianteId, deposito],
      ),
    ).rejects.toThrow(/movimientos_origen_distinto_de_destino/);
    expect(await b.base.select().from(stockActual)).toEqual([]);
  });

  it("verificarStock y recalcularStock, los que usa el panel, detectan y arreglan un descuadre", async () => {
    await cargarMovimientosDeEjemplo();
    expect(await verificarStock()).toEqual([]);

    await b.consultar("update stock_actual set cantidad = 50 where ubicacion_id = $1", [evento]);
    expect(await verificarStock()).toEqual([{ varianteId, ubicacionId: evento, materializado: 50, segunMovimientos: 2 }]);

    expect(await recalcularStock()).toBe(2);
    expect(await verificarStock()).toEqual([]);
  });

  it("recalcular_stock_actual() reconstruye la tabla después de corromperla a propósito", async () => {
    await cargarMovimientosDeEjemplo();

    await b.consultar("update stock_actual set cantidad = 999 where ubicacion_id = $1", [deposito]);
    await b.consultar("delete from stock_actual where ubicacion_id = $1", [evento]);
    const descuadres = await b.consultar<Descuadre>("select * from verificar_stock_actual() order by ubicacion_id");
    expect(descuadres).toEqual([
      { variante_id: varianteId, ubicacion_id: deposito, materializado: 999, segun_movimientos: 7 },
      { variante_id: varianteId, ubicacion_id: evento, materializado: null, segun_movimientos: 2 },
    ]);

    const { filas } = await b.consultarUno<{ filas: number }>("select recalcular_stock_actual() as filas");
    expect(filas).toBe(2);
    expect(await b.consultar<Descuadre>("select * from verificar_stock_actual()")).toEqual([]);
    const stock = await b.base.select().from(stockActual).orderBy(asc(stockActual.ubicacionId));
    expect(stock.map((s) => s.cantidad)).toEqual([7, 2]);
  });
});
