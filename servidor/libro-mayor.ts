import { sql } from "drizzle-orm";
import { db } from "@/db/conexion";

// Las dos funciones de la base que cuidan que stock_actual sea copia fiel del libro mayor.
// Se llaman en el FROM para que el resultado tenga la misma forma con postgres.js y con PGlite.

export async function verificarStock() {
  return db()
    .select({
      varianteId: sql<number>`d.variante_id`,
      ubicacionId: sql<number>`d.ubicacion_id`,
      materializado: sql<number | null>`d.materializado`,
      segunMovimientos: sql<number | null>`d.segun_movimientos`,
    })
    .from(sql`verificar_stock_actual() as d`);
}

// Reconstruye stock_actual entero desde movimientos. Devuelve cuántas filas escribió.
export async function recalcularStock() {
  const [resultado] = await db()
    .select({ filas: sql<number>`filas` })
    .from(sql`recalcular_stock_actual() as filas`);
  if (!resultado) throw new Error("recalcular_stock_actual() no devolvió nada");
  return resultado.filas;
}
