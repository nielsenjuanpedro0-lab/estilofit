import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, eventos, productos, stockActual, variantes } from "@/db/esquema";
import type { EventoParaCelular, Paquete } from "@/contrato/paquete";
import { vendedoresHabilitados } from "@/servidor/usuarios";

const columnasDeEvento = {
  id: eventos.id,
  nombre: eventos.nombre,
  lugar: eventos.lugar,
  fechaDesde: eventos.fechaDesde,
  fechaHasta: eventos.fechaHasta,
  estado: eventos.estado,
};

// Los cerrados no aparecen: no hay nada que vender ahí.
export async function eventosParaCelular(): Promise<EventoParaCelular[]> {
  return db().select(columnasDeEvento).from(eventos).where(ne(eventos.estado, "cerrado")).orderBy(asc(eventos.fechaDesde));
}

export async function otrosDispositivosEn(eventoId: number, dispositivoId: number) {
  return db().$count(dispositivos, and(eq(dispositivos.eventoId, eventoId), ne(dispositivos.id, dispositivoId), isNull(dispositivos.revocadoAt)));
}

export async function informarPendientes(dispositivoId: number, pendientes: number) {
  await db()
    .update(dispositivos)
    .set({ pendientesInformadas: pendientes, pendientesInformadasAt: new Date() })
    .where(eq(dispositivos.id, dispositivoId));
}

export async function armarPaquete(eventoId: number, dispositivoId: number): Promise<Paquete | null> {
  const [evento] = await db().select({ ...columnasDeEvento, ubicacionId: eventos.ubicacionId }).from(eventos).where(eq(eventos.id, eventoId));
  if (!evento) return null;
  const { ubicacionId, ...datosDelEvento } = evento;

  // Va todo lo que tiene fila de stock en el evento, aunque esté en cero o negativo: es lo que se llevó.
  const filas = await db()
    .select({
      varianteId: variantes.id,
      productoId: productos.id,
      producto: productos.nombre,
      marca: productos.marca,
      categoria: productos.categoria,
      sku: variantes.sku,
      talle: variantes.talle,
      color: variantes.color,
      precio: variantes.precio,
      imagenUrl: variantes.imagenUrl,
      stock: stockActual.cantidad,
      // Columna del evento escrita a mano y calificada: ver resumenDeEventos.
      vendidas: sql`(select coalesce(sum(vi.cantidad), 0) from venta_items vi join ventas v on v.id = vi.venta_id
                     where vi.variante_id = "variantes"."id" and v.evento_id = ${evento.id} and not v.anulada)`.mapWith(Number),
    })
    .from(stockActual)
    .innerJoin(variantes, eq(variantes.id, stockActual.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(stockActual.ubicacionId, ubicacionId))
    .orderBy(asc(productos.id), asc(variantes.id));

  await db().update(dispositivos).set({ eventoId: evento.id }).where(eq(dispositivos.id, dispositivoId));
  const vendedores = (await vendedoresHabilitados()).flatMap((v) => (v.pinHash ? [{ id: v.id, nombre: v.nombre, pinHash: v.pinHash }] : []));
  return { evento: datosDelEvento, variantes: filas, otrosDispositivos: await otrosDispositivosEn(evento.id, dispositivoId), vendedores };
}
