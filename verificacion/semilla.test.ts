import { afterEach, describe, expect, it } from "vitest";
import { sembrar } from "@/db/semilla";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

type Base = Awaited<ReturnType<typeof levantarBaseEmbebida>>;
const abiertas: Base[] = [];

async function baseSembrada() {
  const b = await levantarBaseEmbebida();
  abiertas.push(b);
  await sembrar();
  return b;
}

afterEach(async () => {
  for (const b of abiertas.splice(0)) await b.cerrar();
});

// Una foto de lo que ve el cliente en la demo, para comparar corridas entre sí.
async function foto(b: Base) {
  return {
    variantes: await b.consultar("select sku, talle, color, precio, costo from variantes order by sku"),
    stock: await b.consultar(
      "select v.sku, u.nombre, s.cantidad from stock_actual s join variantes v on v.id = s.variante_id join ubicaciones u on u.id = s.ubicacion_id order by v.sku, u.nombre",
    ),
    ventas: await b.consultar("select client_uuid, total, medio_pago, vendido_at from ventas order by client_uuid"),
  };
}

describe("semilla", () => {
  it("corre completa contra Postgres y deja todo cuadrado con el libro mayor", async () => {
    const b = await baseSembrada();

    const conteo = await b.consultarUno<{ productos: number; variantes: number; fijas: number }>(
      "select (select count(*)::int from productos) as productos, (select count(*)::int from variantes) as variantes, (select count(*)::int from ubicaciones where tipo <> 'evento') as fijas",
    );
    expect(conteo).toEqual({ productos: 19, variantes: 60, fijas: 3 });
    expect(await b.consultar("select * from verificar_stock_actual()")).toEqual([]);

    const skus = await b.consultar<{ sku: string }>("select sku from variantes");
    for (const { sku } of skus) expect(sku).toMatch(/^\d{3,4}$/);
  });

  it("deja un evento cerrado con ventas y ajustes, y uno nuevo abierto con stock", async () => {
    const b = await baseSembrada();

    const eventos = await b.consultar<{ nombre: string; estado: string; ventas: number; ajustes: number; stock: number }>(
      `select e.nombre, e.estado,
              (select count(*)::int from ventas v where v.evento_id = e.id) as ventas,
              (select count(*)::int from movimientos m where m.tipo = 'ajuste' and m.ref_id = e.id) as ajustes,
              (select coalesce(sum(s.cantidad), 0)::int from stock_actual s where s.ubicacion_id = e.ubicacion_id) as stock
       from eventos e order by e.fecha_desde`,
    );
    expect(eventos).toHaveLength(2);
    const [cerrado, nuevo] = eventos;
    expect(cerrado).toMatchObject({ nombre: "Tandil Trail Run", estado: "cerrado", ajustes: 3, stock: 0 });
    expect(cerrado?.ventas).toBeGreaterThan(80);
    expect(nuevo).toMatchObject({ nombre: "Desafío Sierra de la Ventana", estado: "abierto", ventas: 0 });
    expect(nuevo?.stock).toBeGreaterThan(100);

    // El redondeo en efectivo de la semilla queda dentro del tope: nada para revisar.
    const { revisar } = await b.consultarUno<{ revisar: number }>("select count(*)::int as revisar from ventas where para_revisar");
    expect(revisar).toBe(0);
  });

  it("da exactamente lo mismo en dos corridas", async () => {
    const primera = await foto(await baseSembrada());
    const segunda = await foto(await baseSembrada());
    expect(segunda).toEqual(primera);
  });

  it("se niega a correr sobre una base con datos", async () => {
    await baseSembrada();
    await expect(sembrar()).rejects.toThrow(/solo corre sobre una base vacía/);
  });
});
