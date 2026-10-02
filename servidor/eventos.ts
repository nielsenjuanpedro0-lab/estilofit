import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, ubicaciones } from "@/db/esquema";

// Cada evento abre su propia ubicación de stock. Un segundo equipo de venta móvil es otro evento
// con otra ubicación: no hay límite y el stock de cada equipo queda separado.
export async function crearEvento(datos: { nombre: string; lugar: string; fechaDesde: string; fechaHasta: string }) {
  return db().transaction(async (tx) => {
    const [ubicacion] = await tx
      .insert(ubicaciones)
      .values({ nombre: `${datos.nombre} · ${datos.fechaDesde}`, tipo: "evento" })
      .returning({ id: ubicaciones.id });
    if (!ubicacion) throw new Error("No se creó la ubicación del evento");
    const [evento] = await tx
      .insert(eventos)
      .values({ ...datos, ubicacionId: ubicacion.id })
      .returning();
    if (!evento) throw new Error("No se creó el evento");
    return evento;
  });
}

export async function abrirEvento(id: number) {
  const [abierto] = await db()
    .update(eventos)
    .set({ estado: "abierto" })
    .where(and(eq(eventos.id, id), eq(eventos.estado, "preparacion")))
    .returning({ id: eventos.id });
  return abierto !== undefined;
}

// Subselects correlacionados con la fila de eventos. La columna del evento va escrita a mano y
// calificada: interpolar ${eventos.ubicacionId} en una consulta sin JOINs emite "ubicacion_id" sin
// tabla, adentro del subselect lo resuelve la tabla de adentro (ventas tiene ubicacion_id), la
// condición se vuelve una tautología y suma todo. No falla: devuelve mal. Hay un test para eso.
const sumaDeMovimientos = (tipo: "transferencia" | "venta" | "ajuste", lado: "origen" | "destino") =>
  sql`(select coalesce(sum(m.cantidad), 0) from movimientos m
       where m.tipo = ${tipo} and ${sql.raw(lado === "origen" ? "m.ubicacion_origen_id" : "m.ubicacion_destino_id")} = "eventos"."ubicacion_id")`.mapWith(
    Number,
  );

export async function resumenDeEventos(filtro?: SQL) {
  return db()
    .select({
      id: eventos.id,
      nombre: eventos.nombre,
      lugar: eventos.lugar,
      fechaDesde: eventos.fechaDesde,
      fechaHasta: eventos.fechaHasta,
      estado: eventos.estado,
      ubicacionId: eventos.ubicacionId,
      cerradoAt: eventos.cerradoAt,
      llevadas: sumaDeMovimientos("transferencia", "destino"),
      vendidas: sumaDeMovimientos("venta", "origen"),
      faltantes: sumaDeMovimientos("ajuste", "origen"),
      sobrantes: sumaDeMovimientos("ajuste", "destino"),
      devueltas: sumaDeMovimientos("transferencia", "origen"),
      ventas: sql`(select count(*) from ventas v where v.evento_id = "eventos"."id" and not v.anulada)`.mapWith(Number),
      facturado: sql`(select coalesce(sum(v.total), 0) from ventas v where v.evento_id = "eventos"."id" and not v.anulada)`.mapWith(Number),
      paraRevisar: sql`(select count(*) from ventas v where v.evento_id = "eventos"."id" and v.para_revisar)`.mapWith(Number),
    })
    .from(eventos)
    .where(filtro)
    .orderBy(desc(eventos.fechaDesde), desc(eventos.id));
}
