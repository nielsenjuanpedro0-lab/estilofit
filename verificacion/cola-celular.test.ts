import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as sincronizarEnServidor } from "@/app/api/sincronizar/route";
import { almacen } from "@/celular/almacen";
import { proximoIntento, sincronizar } from "@/celular/cola";
import { quitarEvento } from "@/celular/paquete";
import { empezarTurno, pinCorrecto } from "@/celular/vendedor";
import { hashearPin } from "@/servidor/usuarios";
import { guardarVenta } from "@/celular/venta";
import { revocarDispositivo } from "@/servidor/dispositivos";
import { prepararEscenario } from "@/verificacion/escenario";

// La cola real del celular contra el endpoint real del servidor. Lo único simulado es la red:
// IndexedDB en memoria y un fetch que puede cortarse, perder la respuesta o devolver 500.

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
type Red = "normal" | "sin-red" | "respuesta-perdida" | "error-500";

let e: Escenario;
let red: Red = "normal";

async function fetchSimulado(entrada: RequestInfo | URL, init?: RequestInit) {
  const ruta = String(entrada);
  if (ruta !== "/api/sincronizar") throw new Error(`El test no esperaba un pedido a ${ruta}`);
  if (red === "sin-red") throw new TypeError("Failed to fetch");
  if (red === "error-500") return Response.json({ error: "Caído" }, { status: 500 });
  const respuesta = await sincronizarEnServidor(new Request(`http://localhost${ruta}`, init));
  // El servidor procesó todo, pero la respuesta no llega al celular.
  if (red === "respuesta-perdida") throw new TypeError("Failed to fetch");
  return respuesta;
}

beforeEach(async () => {
  e = await prepararEscenario();
  red = "normal";
  vi.stubGlobal("fetch", fetchSimulado);
  await Promise.all(almacen.tables.map((t) => t.clear()));
  const { id } = await e.b.consultarUno<{ id: number }>("select id from dispositivos where nombre = 'Celular A'");
  await almacen.sesion.put({ id: 1, token: e.tokenA, dispositivoId: id, dispositivoNombre: "Celular A", revocado: false });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await e.b.cerrar();
});

async function vender(cuantas: number, eventoId = e.evento.id, vendedorId: number | null = null) {
  for (let i = 0; i < cuantas; i++) {
    const v = e.llevadas[i % e.llevadas.length];
    if (!v) throw new Error("Escenario incompleto");
    await guardarVenta({
      eventoId,
      items: [{ varianteId: v.id, cantidad: 1, precio: v.precio, descripcion: "prueba" }],
      medioPago: "efectivo",
      vendedorId,
      total: v.precio,
    });
    // guardarVenta dispara la cola sola: se espera a que termine antes de la próxima.
    await sincronizar();
  }
}

const contarLocales = (estado: "pendiente" | "confirmada" | "rechazada") => almacen.ventas.where("estado").equals(estado).count();

async function ventasEnServidor() {
  const { n } = await e.b.consultarUno<{ n: number }>("select count(*)::int as n from ventas where evento_id = $1", [e.evento.id]);
  return n;
}

describe("cola de ventas del celular", () => {
  it("15 ventas sin señal quedan pendientes; al volver la señal suben y el servidor tiene exactamente 15", async () => {
    red = "sin-red";
    await vender(15);
    expect(await contarLocales("pendiente")).toBe(15);
    expect(await ventasEnServidor()).toBe(0);

    red = "normal";
    expect(await sincronizar({ sinEsperar: true })).toBe("al-dia");
    expect(await contarLocales("pendiente")).toBe(0);
    expect(await contarLocales("confirmada")).toBe(15);
    expect(await ventasEnServidor()).toBe(15);
  });

  it("si la respuesta se pierde, la venta sigue pendiente y el reintento no la duplica", async () => {
    red = "respuesta-perdida";
    await vender(3);
    expect(await ventasEnServidor()).toBe(3);
    expect(await contarLocales("pendiente")).toBe(3);

    red = "normal";
    expect(await sincronizar({ sinEsperar: true })).toBe("al-dia");
    expect(await contarLocales("confirmada")).toBe(3);
    expect(await ventasEnServidor()).toBe(3);
  });

  it("reenviar todas las ventas del celular, también las confirmadas, no duplica ninguna", async () => {
    await vender(5);
    const antes = await almacen.ventas.toArray();
    expect(antes.every((v) => v.estado === "confirmada")).toBe(true);

    for (let i = 0; i < 3; i++) expect(await sincronizar({ todas: true })).toBe("al-dia");

    expect(await ventasEnServidor()).toBe(5);
    const despues = await almacen.ventas.toArray();
    expect(despues.map((v) => v.confirmadaEn)).toEqual(antes.map((v) => v.confirmadaEn));
  });

  it("un 500 deja la venta pendiente con backoff, y el reloj no la reintenta antes de tiempo", async () => {
    red = "error-500";
    await vender(1);
    const [venta] = await almacen.ventas.toArray();
    expect(venta).toMatchObject({ estado: "pendiente", intentos: 1 });
    expect(venta?.proximoIntentoEn).toBeGreaterThanOrEqual(Date.now() - 10);

    red = "normal";
    await almacen.ventas.toCollection().modify({ proximoIntentoEn: Date.now() + 60_000 });
    expect(await sincronizar()).toBe("nada-para-subir");
    expect(await sincronizar({ sinEsperar: true })).toBe("al-dia");
  });

  it("una venta que el servidor rechaza queda rechazada, visible y no se reintenta", async () => {
    await vender(1, 999_999);
    const [venta] = await almacen.ventas.toArray();
    expect(venta?.estado).toBe("rechazada");
    expect(venta?.motivoRechazo).toMatch(/evento 999999 no existe/);
    expect(await sincronizar({ sinEsperar: true })).toBe("nada-para-subir");
  });

  it("si el celular fue revocado, deja de subir pero no pierde ninguna venta", async () => {
    const { id } = await e.b.consultarUno<{ id: number }>("select id from dispositivos where nombre = 'Celular A'");
    await revocarDispositivo(id);
    await vender(2);
    expect(await sincronizar({ sinEsperar: true })).toBe("revocado");
    expect(await contarLocales("pendiente")).toBe(2);
    expect((await almacen.sesion.get(1))?.revocado).toBe(true);
  });

  it("un evento con ventas sin subir no se puede quitar del celular; subidas, sí, y las ventas quedan", async () => {
    await almacen.eventos.put({ id: e.evento.id, nombre: "x", lugar: "x", fechaDesde: "2026-10-24", fechaHasta: "2026-10-25", descargadoEn: 0, otrosDispositivos: 0 });
    red = "sin-red";
    await vender(2);
    expect(await quitarEvento(e.evento.id)).toMatchObject({ ok: false, mensaje: expect.stringMatching(/2 ventas sin subir/) });
    expect(await almacen.eventos.get(e.evento.id)).toBeDefined();

    red = "normal";
    await sincronizar({ sinEsperar: true });
    expect(await quitarEvento(e.evento.id)).toEqual({ ok: true });
    expect(await almacen.eventos.get(e.evento.id)).toBeUndefined();
    expect(await almacen.ventas.count()).toBe(2);
  });

  it("la venta llega a nombre de quien vendía, y un vendedor desactivado no la frena pero la manda a revisar", async () => {
    const { id: nico } = await e.b.consultarUno<{ id: number }>("select id from usuarios where nombre = 'Nicolás Pereyra'");
    await vender(1, e.evento.id, nico);
    expect(await e.b.consultarUno("select usuario_id, para_revisar from ventas order by id desc limit 1")).toEqual({ usuario_id: nico, para_revisar: false });
    const { usuario } = await e.b.consultarUno<{ usuario: number }>("select usuario_id as usuario from movimientos order by id desc limit 1");
    expect(usuario).toBe(nico);

    await e.b.consultar("update usuarios set activo = false where id = $1", [nico]);
    await vender(1, e.evento.id, nico);
    const ultima = await e.b.consultarUno<{ usuario_id: number | null; motivo_revision: string }>(
      "select usuario_id, motivo_revision from ventas order by id desc limit 1",
    );
    expect(ultima).toEqual({ usuario_id: null, motivo_revision: `El vendedor ${nico} no existe o está desactivado` });
  });

  it("el PIN se verifica en el celular con la misma cuenta que usó el servidor para guardarlo", async () => {
    const hash = hashearPin("4729");
    expect(await pinCorrecto("4729", hash)).toBe(true);
    expect(await pinCorrecto("4728", hash)).toBe(false);

    await almacen.vendedores.put({ id: 9, nombre: "Flor", pinHash: hash });
    expect(await empezarTurno({ id: 9, nombre: "Flor", pinHash: hash }, "0000")).toBe(false);
    expect(await almacen.turno.get(1)).toBeUndefined();
    expect(await empezarTurno({ id: 9, nombre: "Flor", pinHash: hash }, "4729")).toBe(true);
    expect(await almacen.turno.get(1)).toMatchObject({ vendedorId: 9, nombre: "Flor" });
  });

  it("el backoff crece hasta un techo de cinco minutos", () => {
    expect(proximoIntento(1, 0, () => 1)).toBe(4_000);
    expect(proximoIntento(3, 0, () => 1)).toBe(16_000);
    expect(proximoIntento(20, 0, () => 1)).toBe(300_000);
    expect(proximoIntento(20, 0, () => 0)).toBe(0);
  });
});
