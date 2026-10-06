import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sembrar } from "@/db/semilla";
import { listarAuditoria, registrarAuditoria } from "@/servidor/auditoria";
import { buscar } from "@/servidor/busqueda";
import { listarMovimientos } from "@/servidor/movimientos";
import { rankingDeVendedores } from "@/servidor/reportes";
import { datosDelTablero } from "@/servidor/tablero";
import { listarVentas, marcarRevisada, ventaConDetalle } from "@/servidor/ventas";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

// Las consultas de las pantallas del panel, contra la semilla completa y comparadas con SQL escrito aparte.

let b: Awaited<ReturnType<typeof levantarBaseEmbebida>>;

beforeAll(async () => {
  b = await levantarBaseEmbebida();
  await sembrar();
});
afterAll(async () => {
  await b.cerrar();
});

async function contar(sql: string, parametros: unknown[] = []) {
  return (await b.consultarUno<{ n: number }>(sql, parametros)).n;
}

describe("listado de ventas", () => {
  it("pagina de a 50, y los totales son los de todo el filtro y no los de la página", async () => {
    const todas = await contar("select count(*)::int as n from ventas");
    const primera = await listarVentas({});
    expect(primera.total).toBe(todas);
    expect(primera.filas).toHaveLength(Math.min(50, todas));
    const ultima = await listarVentas({ pagina: String(Math.ceil(todas / 50)) });
    expect(ultima.filas).toHaveLength(todas % 50 || 50);
    expect(primera.facturado).toBe(Number((await b.consultarUno<{ f: string }>("select sum(total) as f from ventas")).f));
    expect(primera.unidades).toBe(await contar("select sum(cantidad)::int as n from venta_items"));
  });

  it("filtra por medio de pago y ordena por total", async () => {
    const efectivo = await listarVentas({ medio: "efectivo", orden: "total", dir: "asc" }, true);
    expect(efectivo.total).toBe(await contar("select count(*)::int as n from ventas where medio_pago = 'efectivo'"));
    const totales = efectivo.filas.map((v) => v.total);
    expect(totales).toEqual([...totales].sort((x, y) => x - y));
    expect(efectivo.filas.every((v) => v.medioPago === "efectivo")).toBe(true);
  });

  it("un parámetro de orden inventado no rompe nada: ordena por fecha", async () => {
    const listado = await listarVentas({ orden: "drop table ventas", dir: "cualquiera" });
    expect(listado.campo).toBe("fecha");
    expect(listado.dir).toBe("desc");
  });

  it("marcar como revisada deja el rastro y no se puede revisar dos veces", async () => {
    const { id } = await b.consultarUno<{ id: number }>("select id from ventas order by id limit 1");
    const { id: usuarioId } = await b.consultarUno<{ id: number }>("select id from usuarios where rol = 'encargado'");
    expect(await marcarRevisada(id, usuarioId, "no estaba para revisar")).toBe(false);

    await b.consultar("update ventas set para_revisar = true, motivo_revision = 'prueba' where id = $1", [id]);
    expect((await listarVentas({ estado: "revisar" })).filas.map((v) => v.id)).toContain(id);
    expect(await marcarRevisada(id, usuarioId, "redondeo acordado")).toBe(true);
    expect(await marcarRevisada(id, usuarioId, "otra vez")).toBe(false);

    const detalle = await ventaConDetalle(id);
    expect(detalle?.revisor).toBe("Lucía Fernández");
    expect(detalle?.venta.notaDeRevision).toBe("redondeo acordado");
    expect(detalle?.asientos.length).toBe(detalle?.renglones.length);
    expect((await listarVentas({ estado: "revisar" })).filas.map((v) => v.id)).not.toContain(id);
  });
});

describe("movimientos y auditoría", () => {
  it("filtra el libro mayor por tipo y por ubicación", async () => {
    const mermas = await listarMovimientos({ tipo: "merma" }, true);
    expect(mermas.total).toBe(await contar("select count(*)::int as n from movimientos where tipo = 'merma'"));
    expect(mermas.filas.every((m) => m.tipo === "merma")).toBe(true);
    expect(await listarMovimientos({ tipo: "inventado" })).toMatchObject({ total: await contar("select count(*)::int as n from movimientos") });

    const { id: deposito } = await b.consultarUno<{ id: number }>("select id from ubicaciones where nombre = 'Depósito'");
    const delDeposito = await listarMovimientos({ ubicacion: String(deposito) });
    expect(delDeposito.total).toBe(
      await contar("select count(*)::int as n from movimientos where ubicacion_origen_id = $1 or ubicacion_destino_id = $1", [deposito]),
    );
  });

  it("la auditoría filtra por texto y por área", async () => {
    const { id } = await b.consultarUno<{ id: number }>("select id from usuarios where rol = 'administrador'");
    await registrarAuditoria(id, "Catálogo", "Cambió el precio de Gel energético");
    await registrarAuditoria(id, "Stock", "Transferencia de Depósito a Showroom");
    expect((await listarAuditoria({ q: "gel" })).filas.map((a) => a.detalle)).toEqual(["Cambió el precio de Gel energético"]);
    expect((await listarAuditoria({ accion: "Stock" })).total).toBe(1);
    expect((await listarAuditoria({ q: "Martín" })).total).toBe(2);
  });
});

describe("buscador, tablero y vendedores", () => {
  it("el buscador encuentra productos, SKU y eventos, y usuarios solo si se pide", async () => {
    const porNombre = await buscar("gel", false);
    expect(porNombre.some((r) => r.tipo === "Producto" && r.titulo === "Gel energético")).toBe(true);
    const porSku = await buscar("1201", false);
    expect(porSku.some((r) => r.tipo === "SKU" && r.titulo.startsWith("1201"))).toBe(true);
    expect((await buscar("tandil", false)).some((r) => r.tipo === "Evento")).toBe(true);
    expect((await buscar("martín", false)).some((r) => r.tipo === "Usuario")).toBe(false);
    expect((await buscar("martín", true)).some((r) => r.tipo === "Usuario")).toBe(true);
    expect(await buscar("g", true)).toEqual([]);
  });

  it("el tablero arma sus números sin romper y el stock bajo respeta el umbral", async () => {
    const d = await datosDelTablero();
    expect(d.enCurso.map((e) => e.nombre)).toEqual(["Desafío Sierra de la Ventana"]);
    expect(d.stockBajo.every((v) => v.cantidad <= d.umbralStockBajo)).toBe(true);
    expect(d.stock.unidades).toBeGreaterThan(0);
  });

  it("el ranking de vendedores suma lo mismo que las ventas", async () => {
    const ranking = await rankingDeVendedores({});
    expect(ranking.reduce((s, v) => s + v.ventas, 0)).toBe(await contar("select count(*)::int as n from ventas"));
    expect(ranking.reduce((s, v) => s + v.unidades, 0)).toBe(await contar("select sum(cantidad)::int as n from venta_items"));
  });
});
