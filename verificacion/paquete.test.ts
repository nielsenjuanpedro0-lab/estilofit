import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listarEventos } from "@/app/api/eventos/route";
import { GET as bajarPaquete } from "@/app/api/paquete/route";
import { ListaDeEventos, Paquete } from "@/contrato/paquete";
import { UNIDADES_POR_VARIANTE, prepararEscenario, subirOk, ventaDePrueba } from "@/verificacion/escenario";

type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;
let e: Escenario;

beforeEach(async () => {
  e = await prepararEscenario();
});
afterEach(async () => {
  await e.b.cerrar();
});

function pedido(ruta: string, token: string | null) {
  return new Request(`http://localhost${ruta}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function paquete(token: string) {
  const respuesta = await bajarPaquete(pedido(`/api/paquete?evento=${e.evento.id}`, token));
  expect(respuesta.status).toBe(200);
  return Paquete.parse(await respuesta.json());
}

describe("paquete del evento", () => {
  it("sin token válido no se baja ni el catálogo ni la lista de eventos", async () => {
    expect((await bajarPaquete(pedido(`/api/paquete?evento=${e.evento.id}`, null))).status).toBe(401);
    expect((await bajarPaquete(pedido(`/api/paquete?evento=${e.evento.id}`, "inventado"))).status).toBe(401);
    expect((await listarEventos(pedido("/api/eventos", null))).status).toBe(401);
  });

  it("lista solo eventos que no están cerrados", async () => {
    const respuesta = await listarEventos(pedido("/api/eventos", e.tokenA));
    const { eventos } = ListaDeEventos.parse(await respuesta.json());
    expect(eventos.map((ev) => ev.nombre).sort()).toEqual(["Desafío Sierra de la Ventana", "Trail de prueba"]);
  });

  it("trae catálogo, precio y stock del evento, y cuenta como vendidas solo las de este evento", async () => {
    const v = e.llevadas[0];
    if (!v) throw new Error("Escenario incompleto");
    await subirOk(e.tokenA, [ventaDePrueba(e.evento.id, [{ varianteId: v.id, cantidad: 1, precio: v.precio }])]);

    const { evento, variantes } = await paquete(e.tokenA);

    expect(evento.id).toBe(e.evento.id);
    expect(variantes).toHaveLength(20);
    const vendida = variantes.find((x) => x.varianteId === v.id);
    // La semilla ya vendió esta misma variante en el Tandil Trail Run: no tiene que sumarse acá.
    expect(vendida).toMatchObject({ precio: v.precio, stock: UNIDADES_POR_VARIANTE - 1, vendidas: 1 });
    expect(variantes.filter((x) => x.varianteId !== v.id).every((x) => x.vendidas === 0)).toBe(true);
  });

  it("cuenta los otros celulares que venden en el mismo evento", async () => {
    expect((await paquete(e.tokenA)).otrosDispositivos).toBe(0);
    expect((await paquete(e.tokenB)).otrosDispositivos).toBe(1);
    const respuesta = await subirOk(e.tokenA, [], { eventoId: e.evento.id, pendientesFueraDelLote: 7 });
    expect(respuesta.otrosDispositivos).toBe(1);

    const { pendientes } = await e.b.consultarUno<{ pendientes: number }>(
      "select pendientes_informadas as pendientes from dispositivos where nombre = 'Celular A'",
    );
    expect(pendientes).toBe(7);
  });
});
