import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepararEscenario } from "@/verificacion/escenario";

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;

beforeEach(async () => {
  e = await prepararEscenario();
});
afterEach(async () => {
  await e.b.cerrar();
});

describe("esquema de compras", () => {
  it("las tablas nuevas existen con RLS prendido", async () => {
    const filas = await e.b.consultar<{ relname: string; rls: boolean }>(
      "select relname, relrowsecurity as rls from pg_class where relname in ('proveedores', 'compras', 'compra_items') order by relname",
    );
    expect(filas).toEqual([
      { relname: "compra_items", rls: true },
      { relname: "compras", rls: true },
      { relname: "proveedores", rls: true },
    ]);
    const { existe } = await e.b.consultarUno<{ existe: boolean }>(
      "select exists (select 1 from information_schema.columns where table_name = 'venta_items' and column_name = 'costo_unitario') as existe",
    );
    expect(existe).toBe(true);
  });
});
