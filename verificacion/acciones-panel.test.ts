import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearValorDeSesion } from "@/servidor/sesion-panel";
import { prepararEscenario } from "@/verificacion/escenario";

// Las server actions del panel corren tal cual. Lo único simulado es lo que solo existe dentro de
// un pedido de Next: la cookie de sesión y la invalidación de caché.
const cookie = vi.hoisted(() => {
  const sesion: { valor: string | undefined } = { valor: undefined };
  return sesion;
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { editarProductoAccion, recalcularStockAccion, renombrarUbicacionAccion, transferirAccion, verificarStockAccion } = await import(
  "@/app/panel/acciones"
);

function formulario(campos: Record<string, string>) {
  const datos = new FormData();
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor);
  return datos;
}

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;
let showroom: number;

// Abre la sesión de un usuario de la semilla, como si hubiera ingresado.
async function entrarComo(email: string) {
  const u = await e.b.consultarUno<{ id: number; version: number }>("select id, version_sesion as version from usuarios where email = $1", [email]);
  cookie.valor = await crearValorDeSesion(u.id, u.version);
}

beforeEach(async () => {
  e = await prepararEscenario();
  await entrarComo("martin@estilofit.com.ar");
  ({ id: showroom } = await e.b.consultarUno<{ id: number }>("select id from ubicaciones where nombre = 'Showroom Tandil'"));
});
afterEach(async () => {
  await e.b.cerrar();
});

async function stockEn(ubicacionId: number, varianteId: number) {
  const filas = await e.b.consultar<{ cantidad: number }>("select cantidad from stock_actual where ubicacion_id = $1 and variante_id = $2", [
    ubicacionId,
    varianteId,
  ]);
  return filas[0]?.cantidad ?? 0;
}

describe("catálogo, ubicaciones y libro mayor desde el panel", () => {
  it("edita los datos de un producto y valida que no queden vacíos", async () => {
    const { id } = await e.b.consultarUno<{ id: number }>("select id from productos where nombre = 'Gel energético'");
    expect(await editarProductoAccion(id, null, formulario({ nombre: "Gel energético Roctane", marca: "GU", categoria: "Nutrición" }))).toMatchObject({
      exito: expect.any(String),
    });
    expect((await e.b.consultarUno<{ nombre: string }>("select nombre from productos where id = $1", [id])).nombre).toBe("Gel energético Roctane");
    expect(await editarProductoAccion(id, null, formulario({ nombre: " ", marca: "GU", categoria: "Nutrición" }))).toEqual({
      error: "Poné el nombre del producto",
    });
  });

  it("renombra una ubicación y no deja repetir un nombre", async () => {
    expect(await renombrarUbicacionAccion(showroom, null, formulario({ nombre: "Depósito" }))).toEqual({ error: "Ya existe una ubicación llamada Depósito" });
    expect(await renombrarUbicacionAccion(showroom, null, formulario({ nombre: "Showroom Tandil Centro" }))).toEqual({ exito: "Nombre guardado" });
  });

  it("verifica el stock, detecta un descuadre y lo arregla recalculando", async () => {
    expect(await verificarStockAccion()).toMatchObject({ exito: expect.stringMatching(/cuadra/) });
    await e.b.consultar("update stock_actual set cantidad = cantidad + 7 where ubicacion_id = $1", [showroom]);
    expect(await verificarStockAccion()).toMatchObject({ error: expect.stringMatching(/descuadre/) });
    expect(await recalcularStockAccion()).toMatchObject({ exito: expect.stringMatching(/reconstruyó/) });
    expect(await verificarStockAccion()).toMatchObject({ exito: expect.stringMatching(/cuadra/) });
  });
});

describe("transferencias desde el panel", () => {
  it("mueve del depósito al showroom y suma en un renglón la misma variante cargada dos veces", async () => {
    const v = e.llevadas[3];
    if (!v) throw new Error("Escenario incompleto");
    const antes = { deposito: await stockEn(e.deposito.id, v.id), showroom: await stockEn(showroom, v.id) };

    const resultado = await transferirAccion(e.deposito.id, showroom, [
      { varianteId: v.id, cantidad: 1 },
      { varianteId: v.id, cantidad: 1 },
    ]);

    expect(resultado).toEqual({ ok: true, unidades: 2 });
    expect(await stockEn(e.deposito.id, v.id)).toBe(antes.deposito - 2);
    expect(await stockEn(showroom, v.id)).toBe(antes.showroom + 2);
    const { n } = await e.b.consultarUno<{ n: number }>(
      "select count(*)::int as n from movimientos where tipo = 'transferencia' and ubicacion_destino_id = $1 and variante_id = $2 and nota like 'Transferencia de%'",
      [showroom, v.id],
    );
    expect(n).toBe(1);
  });

  it("si falta stock no mueve nada y dice qué producto, talle y color bajar", async () => {
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    const resultado = await transferirAccion(e.evento.ubicacionId, showroom, [{ varianteId: v.id, cantidad: 99 }]);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error).toMatch(new RegExp(`${v.talle}.*pediste 99, hay 2`));
  });

  it("no mueve nada hacia un evento cerrado", async () => {
    await e.b.consultar("update eventos set estado = 'cerrado' where id = $1", [e.evento.id]);
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    expect(await transferirAccion(e.deposito.id, e.evento.ubicacionId, [{ varianteId: v.id, cantidad: 1 }])).toEqual({
      ok: false,
      error: "Uno de los dos es un evento cerrado: su stock ya volvió al depósito.",
    });
  });

  it("sin sesión del panel no hace nada", async () => {
    cookie.valor = undefined;
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    await expect(transferirAccion(e.deposito.id, showroom, [{ varianteId: v.id, cantidad: 1 }])).rejects.toThrow(/sesión venció/);
  });
});

describe("roles y auditoría", () => {
  it("consulta no puede mover stock y encargado no puede reconstruir el stock", async () => {
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    await entrarComo("silvia@estilofit.com.ar");
    await expect(transferirAccion(e.deposito.id, showroom, [{ varianteId: v.id, cantidad: 1 }])).rejects.toThrow(/rol Consulta no se puede mover stock/);
    expect(await verificarStockAccion()).toMatchObject({ exito: expect.any(String) });

    await entrarComo("lucia@estilofit.com.ar");
    await expect(recalcularStockAccion()).rejects.toThrow(/rol Encargado no se puede administrar/);
  });

  it("cada cambio queda en la auditoría con su autor, y el movimiento firmado", async () => {
    const v = e.llevadas[3];
    if (!v) throw new Error("Escenario incompleto");
    await entrarComo("lucia@estilofit.com.ar");
    await transferirAccion(e.deposito.id, showroom, [{ varianteId: v.id, cantidad: 1 }]);

    const registro = await e.b.consultarUno<{ quien: string; accion: string; detalle: string }>(
      "select u.nombre as quien, a.accion, a.detalle from auditoria a join usuarios u on u.id = a.usuario_id order by a.id desc limit 1",
    );
    expect(registro).toEqual({ quien: "Lucía Fernández", accion: "Stock", detalle: "Transferencia de Depósito a Showroom Tandil: 1 unidades en 1 variantes" });
    const { quien } = await e.b.consultarUno<{ quien: string }>(
      "select u.nombre as quien from movimientos m join usuarios u on u.id = m.usuario_id order by m.id desc limit 1",
    );
    expect(quien).toBe("Lucía Fernández");
  });

  it("la auditoría no se puede editar ni borrar", async () => {
    // Con la tabla vacía el trigger por fila no se dispararía y el test pasaría sin probar nada.
    await e.b.consultar("insert into auditoria (accion, detalle) values ('Prueba', 'algo que pasó')");
    await expect(e.b.consultar("update auditoria set detalle = 'otra cosa'")).rejects.toThrow(/no se modifica ni se borra/);
    await expect(e.b.consultar("delete from auditoria")).rejects.toThrow(/no se modifica ni se borra/);
  });
});
