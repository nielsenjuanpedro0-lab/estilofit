import { and, count, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/db/conexion";
import { auditoria, usuarios } from "@/db/esquema";
import { diaArgentino, leerListado, parametro, POR_PAGINA, type ParametrosDeListado } from "@/servidor/listados";

// Quién hizo qué en el panel. Solo se agrega: un trigger impide editar o borrar.
export async function registrarAuditoria(usuarioId: number | null, accion: string, detalle: string) {
  await db().insert(auditoria).values({ usuarioId, accion, detalle });
}

// Filtros por usuario, área, texto y fechas (días en hora de Argentina).
function filtros(parametros: ParametrosDeListado) {
  const condiciones: SQL[] = [];
  const usuario = Number(parametro(parametros, "usuario"));
  if (Number.isInteger(usuario) && usuario > 0) condiciones.push(eq(auditoria.usuarioId, usuario));
  const accion = parametro(parametros, "accion");
  if (accion) condiciones.push(eq(auditoria.accion, accion));
  const texto = parametro(parametros, "q")?.trim();
  if (texto) {
    const coincide = or(ilike(auditoria.detalle, `%${texto}%`), ilike(usuarios.nombre, `%${texto}%`));
    if (coincide) condiciones.push(coincide);
  }
  const desde = diaArgentino(parametro(parametros, "desde"));
  if (desde) condiciones.push(gte(auditoria.ocurridoAt, desde));
  const hasta = diaArgentino(parametro(parametros, "hasta"), 1);
  if (hasta) condiciones.push(lt(auditoria.ocurridoAt, hasta));
  return and(...condiciones);
}

export async function listarAuditoria(parametros: ParametrosDeListado, todo = false) {
  const listado = leerListado(parametros, { fecha: auditoria.id, usuario: usuarios.nombre, accion: auditoria.accion }, "fecha");
  const donde = filtros(parametros);
  const consulta = db()
    .select({ id: auditoria.id, ocurridoAt: auditoria.ocurridoAt, accion: auditoria.accion, detalle: auditoria.detalle, usuario: usuarios.nombre })
    .from(auditoria)
    .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
    .where(donde)
    .orderBy(listado.orden);
  const filas = todo ? await consulta : await consulta.limit(POR_PAGINA).offset(listado.desplazamiento);
  const [conteo] = await db().select({ total: count() }).from(auditoria).leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId)).where(donde);
  if (!conteo) throw new Error("count() no devolvió ninguna fila");
  return { filas, total: conteo.total, ...listado };
}
