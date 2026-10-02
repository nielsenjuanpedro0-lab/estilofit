import { randomUUID } from "node:crypto";
import { and, asc, eq, getTableColumns, gte } from "drizzle-orm";
import { POST as sincronizar } from "@/app/api/sincronizar/route";
import { RespuestaSincronizacion, type VentaDelDispositivo } from "@/contrato/sincronizacion";
import { stockActual, ubicaciones, variantes } from "@/db/esquema";
import { sembrar } from "@/db/semilla";
import { canjearCodigo, crearDispositivo } from "@/servidor/dispositivos";
import { abrirEvento, crearEvento } from "@/servidor/eventos";
import { transferir } from "@/servidor/transferencias";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

export const UNIDADES_POR_VARIANTE = 2;

async function darDeAlta(nombre: string) {
  const { codigo } = await crearDispositivo(nombre);
  const alta = await canjearCodigo(codigo);
  if (!alta) throw new Error("No se pudo dar de alta el dispositivo de prueba");
  return alta.token;
}

// Un evento abierto con 20 variantes llevadas desde el depósito y dos celulares dados de alta.
export async function prepararEscenario() {
  const b = await levantarBaseEmbebida();
  await sembrar();

  const [deposito] = await b.base.select().from(ubicaciones).where(eq(ubicaciones.nombre, "Depósito"));
  if (!deposito) throw new Error("La semilla no creó el depósito");
  const evento = await crearEvento({ nombre: "Trail de prueba", lugar: "Tandil", fechaDesde: "2026-10-24", fechaHasta: "2026-10-25" });
  const llevadas = await b.base
    .select(getTableColumns(variantes))
    .from(variantes)
    .innerJoin(stockActual, and(eq(stockActual.varianteId, variantes.id), eq(stockActual.ubicacionId, deposito.id)))
    .where(gte(stockActual.cantidad, UNIDADES_POR_VARIANTE))
    .orderBy(asc(variantes.id))
    .limit(20);
  const transferencia = await transferir({
    origenId: deposito.id,
    destinoId: evento.ubicacionId,
    items: llevadas.map((v) => ({ varianteId: v.id, cantidad: UNIDADES_POR_VARIANTE })),
  });
  if (llevadas.length < 20 || !transferencia.ok) throw new Error("No alcanzó el stock del depósito para el escenario");
  await abrirEvento(evento.id);

  return { b, deposito, evento, llevadas, tokenA: await darDeAlta("Celular A"), tokenB: await darDeAlta("Celular B") };
}

export function ventaDePrueba(
  eventoId: number,
  items: { varianteId: number; cantidad: number; precio: number }[],
  cambios: Partial<VentaDelDispositivo> = {},
): VentaDelDispositivo {
  return {
    clientUuid: randomUUID(),
    eventoId,
    vendidoAt: new Date().toISOString(),
    medioPago: "efectivo",
    total: items.reduce((suma, i) => suma + i.precio * i.cantidad, 0),
    items: items.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
    ...cambios,
  };
}

export async function subir(token: string | null, ventas: unknown[]) {
  const respuesta = await sincronizar(
    new Request("http://localhost/api/sincronizar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ventas }),
    }),
  );
  const cuerpo: unknown = await respuesta.json();
  return { status: respuesta.status, cuerpo };
}

export async function subirOk(token: string, ventas: unknown[]): Promise<RespuestaSincronizacion> {
  const { status, cuerpo } = await subir(token, ventas);
  if (status !== 200) throw new Error(`La sincronización respondió ${status}: ${JSON.stringify(cuerpo)}`);
  return RespuestaSincronizacion.parse(cuerpo);
}
