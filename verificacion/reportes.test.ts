import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrar } from "@/db/semilla";
import { rankingDeProductos, rankingDeTallesPorCategoria, stockPorUbicacion } from "@/servidor/reportes";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

// Los reportes se comparan contra consultas SQL escritas aparte, sobre la semilla completa.

let b: Awaited<ReturnType<typeof levantarBaseEmbebida>>;
let tandil: number;

beforeAll(async () => {
  b = await levantarBaseEmbebida();
  await sembrar();
  ({ id: tandil } = await b.consultarUno<{ id: number }>("select id from eventos where nombre = 'Tandil Trail Run'"));
});
afterAll(async () => {
  await b.cerrar();
});

describe("reportes", () => {
  it("el ranking de productos coincide con las ventas del evento, ordenado de mayor a menor", async () => {
    const ranking = await rankingDeProductos({ eventoId: tandil }, 100);
    const esperado = await b.consultar<{ producto: string; unidades: number }>(
      `select p.nombre as producto, sum(vi.cantidad)::int as unidades
       from venta_items vi join ventas v on v.id = vi.venta_id join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
       where v.evento_id = $1 group by p.id, p.nombre order by unidades desc, p.nombre`,
      [tandil],
    );
    expect(ranking.map((r) => ({ producto: r.producto, unidades: r.unidades }))).toEqual(esperado);
    expect(ranking.length).toBeGreaterThan(5);
  });

  it("el período filtra por la fecha del evento", async () => {
    expect(await rankingDeProductos({ desde: "2026-09-01", hasta: "2026-09-30" })).not.toEqual([]);
    expect(await rankingDeProductos({ desde: "2026-10-01" })).toEqual([]);
    expect(await rankingDeProductos({ hasta: "2026-09-11" })).toEqual([]);
  });

  it("los talles por categoría suman lo mismo que las ventas de cada categoría", async () => {
    const talles = await rankingDeTallesPorCategoria({});
    const esperado = await b.consultar<{ categoria: string; total: number }>(
      `select p.categoria, sum(vi.cantidad)::int as total
       from venta_items vi join variantes va on va.id = vi.variante_id join productos p on p.id = va.producto_id
       group by p.categoria order by p.categoria`,
    );
    expect(talles.map((t) => ({ categoria: t.categoria, total: t.total }))).toEqual(esperado);
    for (const c of talles) {
      const unidades = c.talles.map((t) => t.unidades);
      expect(unidades).toEqual([...unidades].sort((x, y) => y - x));
    }
  });

  it("el stock por ubicación suma lo mismo que el libro mayor, y el filtro por producto lo acota", async () => {
    const stock = await stockPorUbicacion("");
    const esperado = await b.consultar<{ ubicacion: string; unidades: number }>(
      `select u.nombre as ubicacion, sum(s.cantidad)::int as unidades from stock_segun_movimientos s join ubicaciones u on u.id = s.ubicacion_id
       group by u.id, u.nombre having sum(s.cantidad) <> 0 order by u.id`,
    );
    expect(stock.map((s) => ({ ubicacion: s.ubicacion, unidades: s.unidades }))).toEqual(esperado);

    const medias = await stockPorUbicacion("medias");
    const deposito = (lista: typeof stock) => lista.find((s) => s.ubicacion === "Depósito")?.unidades ?? 0;
    expect(deposito(medias)).toBeGreaterThan(0);
    expect(deposito(medias)).toBeLessThan(deposito(stock));
  });
});
