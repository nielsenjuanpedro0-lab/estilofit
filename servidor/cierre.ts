import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { dispositivos, eventos, movimientos, productos, stockSegunMovimientos, variantes } from "@/db/esquema";

// Columna de la variante escrita a mano y calificada: ver resumenDeEventos en servidor/eventos.ts.
const sumaPorVariante = (tipo: "transferencia" | "venta", columna: "ubicacion_destino_id" | "ubicacion_origen_id", ubicacionId: number) =>
  sql`(select coalesce(sum(m.cantidad), 0) from movimientos m
       where m.variante_id = "variantes"."id" and m.tipo = ${tipo} and ${sql.raw(`m.${columna}`)} = ${ubicacionId})`.mapWith(Number);

// Todo lo que necesita la pantalla de cierre, leído del libro mayor.
export async function datosParaCierre(eventoId: number) {
  const [evento] = await db().select().from(eventos).where(eq(eventos.id, eventoId));
  if (!evento) return null;

  const filas = await db()
    .select({
      varianteId: variantes.id,
      producto: productos.nombre,
      categoria: productos.categoria,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
      // Lo que entró al evento menos lo que volvió antes del cierre (si se devolvió algo a mitad).
      salieron: sumaPorVariante("transferencia", "ubicacion_destino_id", evento.ubicacionId),
      vendidas: sumaPorVariante("venta", "ubicacion_origen_id", evento.ubicacionId),
      esperadas: stockSegunMovimientos.cantidad,
    })
    .from(stockSegunMovimientos)
    .innerJoin(variantes, eq(variantes.id, stockSegunMovimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(stockSegunMovimientos.ubicacionId, evento.ubicacionId))
    .orderBy(asc(productos.categoria), asc(productos.id), asc(variantes.id));

  // Un faltante puede ser una venta que todavía está en un celular sin señal: el cierre lo avisa.
  const celulares = await db()
    .select({
      id: dispositivos.id,
      nombre: dispositivos.nombre,
      ultimoContactoAt: dispositivos.ultimoContactoAt,
      pendientes: dispositivos.pendientesInformadas,
      pendientesAt: dispositivos.pendientesInformadasAt,
      revocadoAt: dispositivos.revocadoAt,
    })
    .from(dispositivos)
    .where(eq(dispositivos.eventoId, evento.id))
    .orderBy(asc(dispositivos.nombre));

  return { evento, filas, celulares };
}

// Los asientos que dejó el cierre, para el resumen del evento cerrado.
export async function asientosDelCierre(eventoId: number) {
  return db()
    .select({
      id: movimientos.id,
      tipo: movimientos.tipo,
      cantidad: movimientos.cantidad,
      entra: sql<boolean>`${movimientos.ubicacionDestinoId} is not null`,
      nota: movimientos.nota,
      ocurridoAt: movimientos.ocurridoAt,
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      sku: variantes.sku,
    })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(and(eq(movimientos.refId, eventoId), inArray(movimientos.tipo, ["ajuste", "merma"])))
    .orderBy(asc(movimientos.id));
}

export type Diferencia = { varianteId: number; esperadas: number; contadas: number; diferencia: number };
export type ResultadoCierre = { ok: true; diferencias: Diferencia[] } | { ok: false; motivo: string };

// Lo que falta puede ser mercadería perdida o una venta que se cobró y no se cargó. El sistema
// no lo puede saber: lo decide quien cierra. Por defecto es faltante real.
export type ClaseDeFaltante = "faltante" | "venta_no_registrada";
export type Conteo = { varianteId: number; contadas: number; faltanteEs?: ClaseDeFaltante };

// Esperadas = lo que salió menos lo vendido, según el libro mayor de la ubicación del evento.
// Si dos celulares vendieron la última unidad, lo esperado es negativo y el conteo lo corrige.
// La diferencia no pisa nada: queda asentada como movimiento de ajuste con fecha, y el remanente
// contado vuelve como transferencia. Al terminar, la ubicación del evento queda en cero.
export async function cerrarEvento(eventoId: number, conteo: Conteo[], destinoId: number, usuarioId: number | null = null): Promise<ResultadoCierre> {
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
    const clase = new Map(conteo.map((c) => [c.varianteId, c.faltanteEs ?? "faltante"]));
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
        const ventaNoRegistrada = clase.get(f.varianteId) === "venta_no_registrada";
        lineas.push({
          varianteId: f.varianteId,
          ubicacionOrigenId: evento.ubicacionId,
          cantidad: -f.diferencia,
          // Faltante real es merma; una venta cobrada y no cargada es un ajuste.
          tipo: ventaNoRegistrada ? "ajuste" : "merma",
          refId: evento.id,
          usuarioId,
          ocurridoAt: ahora,
          nota: `Cierre: ${ventaNoRegistrada ? "venta no registrada" : "faltante real"}. Esperadas ${f.esperadas}, contadas ${f.contadas}`,
        });
      }
      if (f.diferencia > 0) {
        lineas.push({
          varianteId: f.varianteId,
          ubicacionDestinoId: evento.ubicacionId,
          cantidad: f.diferencia,
          tipo: "ajuste",
          refId: evento.id,
          usuarioId,
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
          usuarioId,
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
