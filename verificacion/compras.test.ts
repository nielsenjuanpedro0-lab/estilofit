import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepararEscenario } from "@/verificacion/escenario";
import { randomUUID } from "node:crypto";
import { anularCompra, detalleDeCompra, hoyArgentino, listarCompras, registrarCompra, type DatosDeCompra } from "@/servidor/compras";
import { buscar } from "@/servidor/busqueda";
import { verificarStock } from "@/servidor/libro-mayor";
import { cambiarProveedorActivo, crearProveedor, listarProveedores, loMasCompradoA } from "@/servidor/proveedores";
import { transferir } from "@/servidor/transferencias";

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

async function stockEn(ubicacionId: number, varianteId: number) {
  const filas = await e.b.consultar<{ cantidad: number }>("select cantidad from stock_actual where ubicacion_id = $1 and variante_id = $2", [
    ubicacionId,
    varianteId,
  ]);
  return filas[0]?.cantidad ?? 0;
}

async function compraDePrueba(cambios: Partial<DatosDeCompra> = {}): Promise<DatosDeCompra> {
  const proveedor = await crearProveedor({ nombre: `Proveedor ${randomUUID().slice(0, 8)}`, cuit: null, telefono: null, email: null, nota: null });
  const [a, b] = e.llevadas;
  if (!a || !b) throw new Error("Escenario incompleto");
  return {
    clientUuid: randomUUID(),
    proveedorId: proveedor.id,
    ubicacionId: e.deposito.id,
    fecha: hoyArgentino(),
    comprobante: "Remito 0001-00004567",
    nota: null,
    items: [
      { varianteId: a.id, cantidad: 10, costoUnitario: 12345.5 },
      { varianteId: b.id, cantidad: 3, costoUnitario: 2000 },
    ],
    usuarioId: null,
    ...cambios,
  };
}

describe("registrar compras", () => {
  it("crea cabecera, renglones y un movimiento por renglón, sube el stock y pisa el costo", async () => {
    const datos = await compraDePrueba();
    const [a, b] = datos.items;
    if (!a || !b) throw new Error("Datos incompletos");
    const antes = await stockEn(e.deposito.id, a.varianteId);

    const r = await registrarCompra(datos);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.repetida).toBe(false);

    expect(await stockEn(e.deposito.id, a.varianteId)).toBe(antes + 10);
    const movs = await e.b.consultar<{ variante_id: number; cantidad: number; destino: number; origen: number | null }>(
      "select variante_id, cantidad, ubicacion_destino_id as destino, ubicacion_origen_id as origen from movimientos where tipo = 'compra' and ref_id = $1 order by variante_id",
      [r.compraId],
    );
    expect(movs).toHaveLength(2);
    expect(movs.every((m) => m.destino === e.deposito.id && m.origen === null)).toBe(true);
    const costo = await e.b.consultarUno<{ costo: string }>("select costo from variantes where id = $1", [a.varianteId]);
    expect(Number(costo.costo)).toBe(12345.5);
    expect(await verificarStock()).toEqual([]);
  });

  it("el mismo client_uuid dos veces deja una sola compra", async () => {
    const datos = await compraDePrueba();
    const primera = await registrarCompra(datos);
    const segunda = await registrarCompra(datos);
    if (!primera.ok || !segunda.ok) throw new Error("Tenían que entrar las dos");
    expect(segunda).toEqual({ ok: true, compraId: primera.compraId, repetida: true });
    const { n } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from movimientos where tipo = 'compra' and ref_id = $1", [primera.compraId]);
    expect(n).toBe(2);
  });

  it("rechaza variantes repetidas, proveedor inactivo, destino evento, sin renglones y fecha futura", async () => {
    const datos = await compraDePrueba();
    const [a] = datos.items;
    if (!a) throw new Error("Datos incompletos");
    expect(await registrarCompra({ ...datos, items: [a, a] })).toEqual({ ok: false, motivo: expect.stringMatching(/sumá la cantidad en un solo renglón/) });
    expect(await registrarCompra({ ...datos, items: [] })).toEqual({ ok: false, motivo: expect.stringMatching(/al menos un producto/) });
    expect(await registrarCompra({ ...datos, ubicacionId: e.evento.ubicacionId })).toEqual({ ok: false, motivo: expect.stringMatching(/depósito o showroom/) });
    expect(await registrarCompra({ ...datos, fecha: "2099-01-01" })).toEqual({ ok: false, motivo: expect.stringMatching(/futura/) });
    await cambiarProveedorActivo(datos.proveedorId, false);
    expect(await registrarCompra(datos)).toEqual({ ok: false, motivo: expect.stringMatching(/desactivado/) });
    const { n } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from compras where proveedor_id = $1", [datos.proveedorId]);
    expect(n).toBe(0);
  });
});

describe("anular compras", () => {
  it("saca lo que entró con movimientos de salida y no se anula dos veces", async () => {
    const datos = await compraDePrueba();
    const [a] = datos.items;
    if (!a) throw new Error("Datos incompletos");
    const antes = await stockEn(e.deposito.id, a.varianteId);
    const r = await registrarCompra(datos);
    if (!r.ok) throw new Error(r.motivo);

    expect(await anularCompra(r.compraId, null, "Remito cargado dos veces")).toEqual({ ok: true });
    expect(await stockEn(e.deposito.id, a.varianteId)).toBe(antes);
    const salidas = await e.b.consultar("select 1 from movimientos where tipo = 'compra' and ref_id = $1 and ubicacion_origen_id = $2", [r.compraId, e.deposito.id]);
    expect(salidas).toHaveLength(2);
    expect(await verificarStock()).toEqual([]);

    expect(await anularCompra(r.compraId, null, "otra vez")).toEqual({ ok: false, motivo: "La compra ya está anulada", faltantes: [] });
  });

  it("si lo comprado ya se movió, no anula nada y dice qué falta", async () => {
    const proveedor = await crearProveedor({ nombre: "Proveedor showroom", cuit: null, telefono: null, email: null, nota: null });
    const { id: showroom } = await e.b.consultarUno<{ id: number }>("select id from ubicaciones where nombre = 'Showroom Tandil'");
    const [a] = e.llevadas;
    if (!a) throw new Error("Escenario incompleto");
    const enShowroom = await stockEn(showroom, a.id);
    const r = await registrarCompra({
      clientUuid: randomUUID(),
      proveedorId: proveedor.id,
      ubicacionId: showroom,
      fecha: hoyArgentino(),
      comprobante: null,
      nota: null,
      items: [{ varianteId: a.id, cantidad: 5, costoUnitario: 100 }],
      usuarioId: null,
    });
    if (!r.ok) throw new Error(r.motivo);
    const llevar = await transferir({ origenId: showroom, destinoId: e.deposito.id, items: [{ varianteId: a.id, cantidad: enShowroom + 5 }] });
    expect(llevar.ok).toBe(true);

    expect(await anularCompra(r.compraId, null, "error")).toEqual({
      ok: false,
      motivo: expect.stringMatching(/ya no está/),
      faltantes: [{ varianteId: a.id, pedido: 5, disponible: 0 }],
    });
    const { anulada } = await e.b.consultarUno<{ anulada: boolean }>("select anulada from compras where id = $1", [r.compraId]);
    expect(anulada).toBe(false);
  });
});

describe("proveedores con compras anuladas", () => {
  it("el listado y lo más comprado ignoran la compra anulada", async () => {
    const base = await compraDePrueba();
    const [a, b] = base.items;
    if (!a || !b) throw new Error("Datos incompletos");
    const vieja = await registrarCompra({ ...base, fecha: "2026-09-01", items: [{ ...a, cantidad: 4 }] });
    const nueva = await registrarCompra({ ...base, clientUuid: randomUUID(), items: [{ ...b, cantidad: 7 }] });
    if (!vieja.ok || !nueva.ok) throw new Error("Tenían que entrar las dos");
    expect(await anularCompra(nueva.compraId, null, "error de carga")).toEqual({ ok: true });

    const fila = (await listarProveedores()).find((p) => p.id === base.proveedorId);
    expect(fila).toMatchObject({ compras: 1, ultimaCompra: "2026-09-01" });
    const comprado = await loMasCompradoA(base.proveedorId);
    expect(comprado.map((c) => c.unidades)).toEqual([4]);
  });
});

describe("listado y detalle", () => {
  it("lista con unidades y total a costo, filtra por estado y muestra el detalle", async () => {
    const datos = await compraDePrueba();
    const r = await registrarCompra(datos);
    const otra = await registrarCompra({ ...(await compraDePrueba()), comprobante: "Factura A 0002-00000099" });
    if (!r.ok || !otra.ok) throw new Error("Tenían que entrar");
    await anularCompra(otra.compraId, null, "prueba");

    // La semilla también trae compras (Task 10): se compara por id, no por total.
    const todas = await listarCompras({});
    expect(todas.filas.map((f) => f.id)).toEqual(expect.arrayContaining([r.compraId, otra.compraId]));
    const fila = todas.filas.find((f) => f.id === r.compraId);
    expect(fila).toMatchObject({ unidades: 13, total: 10 * 12345.5 + 3 * 2000, anulada: false, comprobante: "Remito 0001-00004567" });
    expect((await listarCompras({ estado: "anuladas" })).filas.map((f) => f.id)).toEqual([otra.compraId]);
    expect((await listarCompras({ q: "0002-000" })).filas.map((f) => f.id)).toEqual([otra.compraId]);

    // Una búsqueda numérica más larga que int4 no rompe la página (issue: desborda a `eq(compras.id, Number(q))`)
    await expect(listarCompras({ q: "123456789012" })).resolves.toMatchObject({ total: 0, filas: [] });

    // Fechas imposibles no rompen con error Postgres (issue: regex acepta 2026-02-31)
    await expect(listarCompras({ desde: "2026-02-31" })).resolves.not.toThrow();
    await expect(listarCompras({ hasta: "2026-02-31" })).resolves.not.toThrow();

    const detalle = await detalleDeCompra(r.compraId);
    expect(detalle?.renglones).toHaveLength(2);
    expect(detalle?.movimientos).toHaveLength(2);
    expect(detalle?.movimientos.every((m) => m.entra)).toBe(true);
    expect(await detalleDeCompra(999_999)).toBeNull();
  });
});

describe("buscador", () => {
  it("encuentra proveedores por nombre y compras por comprobante", async () => {
    const datos = await compraDePrueba({ comprobante: "Factura A 0007-00001234" });
    const r = await registrarCompra(datos);
    if (!r.ok) throw new Error(r.motivo);
    expect(await buscar("0007-0000", false)).toContainEqual(expect.objectContaining({ tipo: "Compra", href: `/panel/compras/${r.compraId}` }));
    expect(await buscar("Proveedor", false)).toContainEqual(expect.objectContaining({ tipo: "Proveedor", href: `/panel/proveedores/${datos.proveedorId}` }));
  });
});
