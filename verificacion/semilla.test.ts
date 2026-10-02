import { afterEach, describe, expect, it } from "vitest";
import { sembrar } from "@/db/semilla";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

type Base = Awaited<ReturnType<typeof levantarBaseEmbebida>>;
const abiertas: Base[] = [];

async function baseSembrada() {
  const b = await levantarBaseEmbebida();
  abiertas.push(b);
  await sembrar(b.base);
  return b;
}

afterEach(async () => {
  for (const b of abiertas.splice(0)) await b.cerrar();
});

// Una foto de todo lo que la semilla deja, para comparar corridas entre sí.
async function foto(b: Base) {
  return {
    variantes: await b.consultar("select sku, talle, color, precio, costo from variantes order by sku"),
    stock: await b.consultar(
      "select v.sku, u.nombre, s.cantidad from stock_actual s join variantes v on v.id = s.variante_id join ubicaciones u on u.id = s.ubicacion_id order by v.sku, u.nombre",
    ),
  };
}

describe("semilla", () => {
  it("carga el catálogo completo y el stock cuadra con el libro mayor", async () => {
    const b = await baseSembrada();

    const conteo = await b.consultarUno<{ productos: number; variantes: number; ubicaciones: number }>(
      "select (select count(*)::int from productos) as productos, (select count(*)::int from variantes) as variantes, (select count(*)::int from ubicaciones) as ubicaciones",
    );
    expect(conteo).toEqual({ productos: 19, variantes: 60, ubicaciones: 3 });
    expect(await b.consultar("select * from verificar_stock_actual()")).toEqual([]);

    const skus = await b.consultar<{ sku: string }>("select sku from variantes");
    for (const { sku } of skus) expect(sku).toMatch(/^\d{3,4}$/);
  });

  it("da exactamente lo mismo en dos corridas", async () => {
    const primera = await foto(await baseSembrada());
    const segunda = await foto(await baseSembrada());
    expect(segunda).toEqual(primera);
  });

  it("se niega a correr sobre una base con datos", async () => {
    const b = await baseSembrada();
    await expect(sembrar(b.base)).rejects.toThrow(/solo corre sobre una base vacía/);
  });
});
