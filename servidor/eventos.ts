import { and, eq } from "drizzle-orm";
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
