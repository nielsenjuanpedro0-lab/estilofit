import { eq } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, movimientos, stockSegunMovimientos } from "@/db/esquema";

export type Diferencia = { varianteId: number; esperadas: number; contadas: number; diferencia: number };
export type ResultadoCierre = { ok: true; diferencias: Diferencia[] } | { ok: false; motivo: string };

// Esperadas = lo que salió menos lo vendido, según el libro mayor de la ubicación del evento.
// Si dos celulares vendieron la última unidad, lo esperado es negativo y el conteo lo corrige.
// La diferencia no pisa nada: queda asentada como movimiento de ajuste con fecha, y el remanente
// contado vuelve como transferencia. Al terminar, la ubicación del evento queda en cero.
export async function cerrarEvento(eventoId: number, conteo: { varianteId: number; contadas: number }[], destinoId: number): Promise<ResultadoCierre> {
  return db().transaction(async (tx) => {
    // FOR UPDATE: dos cierres simultáneos del mismo evento se ordenan y el segundo ve "cerrado".
    const [evento] = await tx.select().from(eventos).where(eq(eventos.id, eventoId)).for("update");
    if (!evento) return { ok: false, motivo: `El evento ${eventoId} no existe` };
    if (evento.estado === "cerrado") return { ok: false, motivo: "Este evento ya está cerrado. Un evento se cierra una sola vez." };
    if (destinoId === evento.ubicacionId) return { ok: false, motivo: "El remanente tiene que volver a otra ubicación, no al mismo evento" };

    const esperado = await tx
      .select({ varianteId: stockSegunMovimientos.varianteId, cantidad: stockSegunMovimientos.cantidad })
      .from(stockSegunMovimientos)
      .where(eq(stockSegunMovimientos.ubicacionId, evento.ubicacionId));
    const contadas = new Map(conteo.map((c) => [c.varianteId, c.contadas]));
    const sinContar = esperado.filter((e) => e.cantidad !== 0 && !contadas.has(e.varianteId));
    if (sinContar.length > 0) {
      return { ok: false, motivo: `Faltan contar ${sinContar.length} variantes. Si no volvió ninguna unidad, cargá 0.` };
    }

    // Una variante contada que no figuraba en el evento también cuenta: llegó por error y es sobrante.
    const esperadas = new Map(esperado.map((e) => [e.varianteId, e.cantidad]));
    const filas = [...new Set([...esperadas.keys(), ...contadas.keys()])].map((varianteId) => {
      const esp = esperadas.get(varianteId) ?? 0;
      const cont = contadas.get(varianteId) ?? 0;
      return { varianteId, esperadas: esp, contadas: cont, diferencia: cont - esp };
    });

    const ahora = new Date();
    const asientos = filas.flatMap((f) => {
      const lineas: (typeof movimientos.$inferInsert)[] = [];
      if (f.diferencia < 0) {
        lineas.push({
          varianteId: f.varianteId,
          ubicacionOrigenId: evento.ubicacionId,
          cantidad: -f.diferencia,
          tipo: "ajuste",
          refId: evento.id,
          ocurridoAt: ahora,
          nota: `Cierre: faltante. Esperadas ${f.esperadas}, contadas ${f.contadas}`,
        });
      }
      if (f.diferencia > 0) {
        lineas.push({
          varianteId: f.varianteId,
          ubicacionDestinoId: evento.ubicacionId,
          cantidad: f.diferencia,
          tipo: "ajuste",
          refId: evento.id,
          ocurridoAt: ahora,
          nota: `Cierre: sobrante. Esperadas ${f.esperadas}, contadas ${f.contadas}`,
        });
      }
      if (f.contadas > 0) {
        lineas.push({
          varianteId: f.varianteId,
          ubicacionOrigenId: evento.ubicacionId,
          ubicacionDestinoId: destinoId,
          cantidad: f.contadas,
          tipo: "transferencia",
          refId: evento.id,
          ocurridoAt: ahora,
          nota: "Cierre: vuelve el remanente",
        });
      }
      return lineas;
    });
    if (asientos.length > 0) await tx.insert(movimientos).values(asientos);

    await tx.update(eventos).set({ estado: "cerrado", cerradoAt: ahora }).where(eq(eventos.id, evento.id));
    return { ok: true, diferencias: filas.filter((f) => f.diferencia !== 0) };
  });
}
