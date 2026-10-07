import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoyArgentino } from "@/servidor/compras";
import { crearValorDeSesion } from "@/servidor/sesion-panel";
import { prepararEscenario } from "@/verificacion/escenario";

const cookie = vi.hoisted(() => {
  const sesion: { valor: string | undefined } = { valor: undefined };
  return sesion;
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { anularCompraAccion, crearProveedorAccion, registrarCompraAccion } = await import("@/app/panel/acciones-compras");

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

let e: Awaited<ReturnType<typeof prepararEscenario>>;
async function entrarComo(email: string) {
  const u = await e.b.consultarUno<{ id: number; version: number }>("select id, version_sesion as version from usuarios where email = $1", [email]);
  cookie.valor = await crearValorDeSesion(u.id, u.version);
}

beforeEach(async () => {
  e = await prepararEscenario();
  await entrarComo("lucia@estilofit.com.ar");
});
afterEach(async () => {
  await e.b.cerrar();
});

async function compraValida() {
  expect(await crearProveedorAccion(null, formulario({ nombre: "Salomon Argentina", cuit: "", telefono: "", email: "", nota: "" }))).toMatchObject({ exito: expect.any(String) });
  const { id } = await e.b.consultarUno<{ id: number }>("select id from proveedores where nombre = 'Salomon Argentina'");
  const [a] = e.llevadas;
  if (!a) throw new Error("Escenario incompleto");
  return { clientUuid: randomUUID(), proveedorId: id, ubicacionId: e.deposito.id, fecha: hoyArgentino(), comprobante: "R-1", nota: "", items: [{ varianteId: a.id, cantidad: 4, costoUnitario: 1500 }] };
}

describe("acciones de compras", () => {
  it("el encargado da de alta un proveedor, carga una compra y la anula; todo queda en auditoría", async () => {
    expect(await crearProveedorAccion(null, formulario({ nombre: " ", cuit: "", telefono: "", email: "", nota: "" }))).toEqual({ error: "Poné el nombre del proveedor" });
    const datos = await compraValida();
    expect(await crearProveedorAccion(null, formulario({ nombre: "salomon argentina", cuit: "", telefono: "", email: "", nota: "" }))).toEqual({
      error: "Ya hay un proveedor llamado salomon argentina",
    });

    const r = await registrarCompraAccion(datos);
    if (!r.ok) throw new Error(r.error);
    expect(await registrarCompraAccion({ ...datos, items: [{ ...datos.items[0], cantidad: 0 }] })).toEqual({ ok: false, error: "La cantidad tiene que ser mayor a 0" });

    expect(await anularCompraAccion(r.compraId, null, formulario({ motivo: "" }))).toEqual({ error: "Contá por qué se anula la compra" });
    expect(await anularCompraAccion(r.compraId, null, formulario({ motivo: "Remito duplicado" }))).toMatchObject({ exito: expect.any(String) });

    const areas = await e.b.consultar<{ detalle: string }>("select detalle from auditoria where accion = 'Compras' order by id");
    expect(areas.map((a) => a.detalle)).toEqual([
      expect.stringMatching(/^Creó el proveedor Salomon Argentina/),
      expect.stringMatching(/^Cargó la compra #\d+ de Salomon Argentina: 4 unidades/),
      expect.stringMatching(/^Anuló la compra #\d+ de Salomon Argentina: Remito duplicado/),
    ]);
  });

  it("Consulta no puede cargar ni anular", async () => {
    const datos = await compraValida();
    await entrarComo("silvia@estilofit.com.ar");
    await expect(registrarCompraAccion(datos)).rejects.toThrow(/Consulta/);
    await expect(anularCompraAccion(1, null, formulario({ motivo: "x" }))).rejects.toThrow(/Consulta/);
  });
});
