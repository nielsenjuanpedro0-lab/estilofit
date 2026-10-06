import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { eventos, productos, usuarios, variantes, ventas } from "@/db/esquema";
import { NOMBRE_DE_ROL } from "@/contrato/permisos";

export type Resultado = { tipo: string; titulo: string; detalle: string; href: string };

// Lo que encuentra el buscador del panel (Ctrl+K). Pocos resultados por tipo: es para saltar, no para listar.
export async function buscar(texto: string, incluirUsuarios: boolean): Promise<Resultado[]> {
  const q = texto.trim();
  if (q.length < 2) return [];
  const patron = `%${q}%`;
  const resultados: Resultado[] = [];

  const porSku = await db()
    .select({ productoId: productos.id, nombre: productos.nombre, sku: variantes.sku, talle: variantes.talle, color: variantes.color })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(ilike(variantes.sku, `${q}%`))
    .orderBy(asc(variantes.sku))
    .limit(5);
  for (const v of porSku) {
    resultados.push({ tipo: "SKU", titulo: `${v.sku} · ${v.nombre}`, detalle: `${v.talle} · ${v.color}`, href: `/panel/catalogo/${v.productoId}` });
  }

  const listaDeProductos = await db()
    .select({ id: productos.id, nombre: productos.nombre, marca: productos.marca, categoria: productos.categoria })
    .from(productos)
    .where(or(ilike(productos.nombre, patron), ilike(productos.marca, patron), ilike(productos.categoria, patron)))
    .orderBy(asc(productos.nombre))
    .limit(6);
  for (const p of listaDeProductos) {
    resultados.push({ tipo: "Producto", titulo: p.nombre, detalle: `${p.marca} · ${p.categoria}`, href: `/panel/catalogo/${p.id}` });
  }

  const listaDeEventos = await db()
    .select({ id: eventos.id, nombre: eventos.nombre, lugar: eventos.lugar, fechaDesde: eventos.fechaDesde })
    .from(eventos)
    .where(or(ilike(eventos.nombre, patron), ilike(eventos.lugar, patron)))
    .orderBy(desc(eventos.fechaDesde))
    .limit(5);
  for (const e of listaDeEventos) {
    resultados.push({ tipo: "Evento", titulo: e.nombre, detalle: `${e.lugar} · ${e.fechaDesde}`, href: `/panel/eventos/${e.id}` });
  }

  // Una venta se busca por su número o por el comienzo de su código (el client_uuid).
  const esNumero = /^\d+$/.test(q);
  const esCodigo = /^[0-9a-f-]{6,}$/i.test(q);
  if (esNumero || esCodigo) {
    const listaDeVentas = await db()
      .select({ id: ventas.id, clientUuid: ventas.clientUuid, total: ventas.total, recibidoAt: ventas.recibidoAt })
      .from(ventas)
      .where(or(esNumero ? eq(ventas.id, Number(q)) : undefined, esCodigo ? ilike(sql`${ventas.clientUuid}::text`, `${q}%`) : undefined))
      .orderBy(desc(ventas.recibidoAt))
      .limit(5);
    for (const v of listaDeVentas) {
      resultados.push({ tipo: "Venta", titulo: `Venta #${v.id} · $${v.total.toLocaleString("es-AR")}`, detalle: v.clientUuid, href: `/panel/ventas/${v.id}` });
    }
  }

  if (incluirUsuarios) {
    const listaDeUsuarios = await db()
      .select({ id: usuarios.id, nombre: usuarios.nombre, email: usuarios.email, rol: usuarios.rol })
      .from(usuarios)
      .where(or(ilike(usuarios.nombre, patron), ilike(usuarios.email, patron)))
      .orderBy(asc(usuarios.nombre))
      .limit(5);
    for (const u of listaDeUsuarios) {
      resultados.push({ tipo: "Usuario", titulo: u.nombre, detalle: `${NOMBRE_DE_ROL[u.rol]}${u.email ? ` · ${u.email}` : ""}`, href: `/panel/usuarios/${u.id}` });
    }
  }
  return resultados;
}
