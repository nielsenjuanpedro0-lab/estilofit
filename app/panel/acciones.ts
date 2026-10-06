"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Movidas } from "@/app/panel/elegir-stock";
import { id, pesos, primerError, texto, type EstadoFormulario } from "@/app/panel/validacion";
import { db } from "@/db/conexion";
import { dispositivos, eventos, productos, ubicaciones, variantes } from "@/db/esquema";
import { exigirPermiso, usuarioActual } from "@/servidor/acceso";
import {
  actualizarProducto,
  actualizarVariante,
  agregarVariante,
  cambiarUbicacionActiva,
  crearProducto,
  crearUbicacion,
  registrarIngreso,
  renombrarUbicacion,
} from "@/servidor/catalogo";
import { cerrarEvento } from "@/servidor/cierre";
import { crearDispositivo, revocarDispositivo } from "@/servidor/dispositivos";
import { abrirEvento, crearEvento } from "@/servidor/eventos";
import { recalcularStock, verificarStock } from "@/servidor/libro-mayor";
import { COOKIE_SESION } from "@/servidor/sesion-panel";
import { transferir } from "@/servidor/transferencias";
import { marcarRevisada } from "@/servidor/ventas";
import { registrarAuditoria } from "@/servidor/auditoria";

// Todo lo que llega acá viene de un formulario o de un POST que cualquiera puede armar: se exige
// sesión y permiso del rol, se valida con Zod, y cada cambio queda en la auditoría con su autor.

export async function salir() {
  const usuario = await usuarioActual();
  if (usuario) await registrarAuditoria(usuario.id, "Sesión", "Salió del panel");
  (await cookies()).delete(COOKIE_SESION);
  redirect("/ingresar");
}

async function nombreDeVariante(varianteId: number) {
  const [v] = await db()
    .select({ nombre: productos.nombre, talle: variantes.talle, color: variantes.color, sku: variantes.sku })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(variantes.id, varianteId));
  return v ? `${v.nombre} ${v.talle} ${v.color} (SKU ${v.sku})` : `variante ${varianteId}`;
}

// La auditoría la lee una persona: nombres, no números.
async function nombreDeEvento(eventoId: number) {
  const [e] = await db().select({ nombre: eventos.nombre }).from(eventos).where(eq(eventos.id, eventoId));
  return e?.nombre ?? `evento ${eventoId}`;
}

async function nombreDeUbicacion(ubicacionId: number) {
  const [u] = await db().select({ nombre: ubicaciones.nombre }).from(ubicaciones).where(eq(ubicaciones.id, ubicacionId));
  return u?.nombre ?? `ubicación ${ubicacionId}`;
}

async function nombreDeProducto(productoId: number) {
  const [p] = await db().select({ nombre: productos.nombre }).from(productos).where(eq(productos.id, productoId));
  return p?.nombre ?? `producto ${productoId}`;
}

// --- Eventos ---

const NuevoEvento = z
  .object({
    nombre: texto("Poné el nombre del evento"),
    lugar: texto("Poné dónde es el evento"),
    fechaDesde: z.iso.date("Elegí la fecha de inicio"),
    fechaHasta: z.iso.date("Elegí la fecha de fin"),
  })
  .refine((e) => e.fechaHasta >= e.fechaDesde, { message: "La fecha de fin no puede ser anterior a la de inicio" });

export async function crearEventoAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = NuevoEvento.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };

  const nombreUbicacion = `${datos.data.nombre} · ${datos.data.fechaDesde}`;
  const [repetida] = await db().select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.nombre, nombreUbicacion));
  if (repetida) return { error: "Ya hay un evento con ese nombre en esa fecha. Si es un segundo equipo, agregale “Equipo 2” al nombre." };

  const evento = await crearEvento(datos.data);
  await registrarAuditoria(yo.id, "Eventos", `Creó el evento ${evento.nombre} (${evento.fechaDesde} al ${evento.fechaHasta}, ${evento.lugar})`);
  redirect(`/panel/eventos/${evento.id}`);
}

export async function abrirEventoAccion(eventoId: number) {
  const yo = await exigirPermiso("operar");
  if (await abrirEvento(id.parse(eventoId))) {
    await registrarAuditoria(yo.id, "Eventos", `Marcó como abierto el evento ${await nombreDeEvento(eventoId)}`);
  }
  revalidatePath(`/panel/eventos/${eventoId}`);
}

const ItemsAMover = z
  .array(z.object({ varianteId: id, cantidad: z.number().int().positive().max(9999) }))
  .min(1, "Elegí al menos una variante con cantidad")
  // La misma variante cargada dos veces en la lista se suma en un solo renglón.
  .transform((items) => {
    const porVariante = new Map<number, number>();
    for (const item of items) porVariante.set(item.varianteId, (porVariante.get(item.varianteId) ?? 0) + item.cantidad);
    return [...porVariante].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));
  });

// Mueve stock y, si falta en el origen, dice qué y cuánto con nombre, talle y color.
async function moverStock(usuarioId: number, origenId: number, destinoId: number, crudos: unknown, nota: string): Promise<Movidas> {
  const items = ItemsAMover.safeParse(crudos);
  if (!items.success) return { ok: false, error: primerError(items.error) };
  if (origenId === destinoId) return { ok: false, error: "El origen y el destino son la misma ubicación" };

  const resultado = await transferir({ origenId, destinoId, items: items.data, nota, usuarioId });
  if (!resultado.ok) {
    const nombres = await db()
      .select({ id: variantes.id, nombre: productos.nombre, talle: variantes.talle, color: variantes.color })
      .from(variantes)
      .innerJoin(productos, eq(productos.id, variantes.productoId))
      .where(inArray(variantes.id, resultado.faltantes.map((f) => f.varianteId)));
    const nombre = new Map(nombres.map((n) => [n.id, `${n.nombre} ${n.talle} ${n.color}`]));
    const detalle = resultado.faltantes.map((f) => `${nombre.get(f.varianteId)}: pediste ${f.pedido}, hay ${f.disponible}`).join("; ");
    return { ok: false, error: `No se movió nada: falta stock en el origen (${detalle}). Bajá esas cantidades y volvé a confirmar.` };
  }
  const unidades = items.data.reduce((suma, i) => suma + i.cantidad, 0);
  await registrarAuditoria(usuarioId, "Stock", `${nota}: ${unidades} unidades en ${items.data.length} variantes`);
  revalidatePath("/panel", "layout");
  return { ok: true, unidades };
}

export async function cargarViaje(eventoId: number, origenId: number, items: unknown): Promise<Movidas> {
  const yo = await exigirPermiso("operar");
  const [evento] = await db().select().from(eventos).where(eq(eventos.id, id.parse(eventoId)));
  if (!evento) return { ok: false, error: "El evento no existe" };
  if (evento.estado === "cerrado") return { ok: false, error: "El evento ya está cerrado: no se le puede cargar stock" };
  return moverStock(yo.id, id.parse(origenId), evento.ubicacionId, items, `Viaje a ${evento.nombre}`);
}

// Transferencias sueltas: depósito ↔ showroom, reposición de un evento, o pasar stock entre dos
// equipos que venden en paralelo. A un evento cerrado no se le mueve nada: su stock ya volvió.
export async function transferirAccion(origenId: number, destinoId: number, items: unknown): Promise<Movidas> {
  const yo = await exigirPermiso("operar");
  const ubicacionesPedidas = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre, activa: ubicaciones.activa, estadoEvento: eventos.estado })
    .from(ubicaciones)
    .leftJoin(eventos, eq(eventos.ubicacionId, ubicaciones.id))
    .where(inArray(ubicaciones.id, [id.parse(origenId), id.parse(destinoId)]));
  const origen = ubicacionesPedidas.find((u) => u.id === origenId);
  const destino = ubicacionesPedidas.find((u) => u.id === destinoId);
  if (!origen || !destino) return { ok: false, error: "Una de las ubicaciones no existe. Recargá la página." };
  if (!origen.activa || !destino.activa) return { ok: false, error: "Una de las ubicaciones está desactivada. Reactivala en Ubicaciones." };
  if (origen.estadoEvento === "cerrado" || destino.estadoEvento === "cerrado") {
    return { ok: false, error: "Uno de los dos es un evento cerrado: su stock ya volvió al depósito." };
  }
  return moverStock(yo.id, origen.id, destino.id, items, `Transferencia de ${origen.nombre} a ${destino.nombre}`);
}

const CierreDeEvento = z.object({
  eventoId: id,
  destinoId: id,
  conteo: z.array(
    z.object({
      varianteId: id,
      contadas: z.number().int().nonnegative().max(99_999),
      faltanteEs: z.enum(["faltante", "venta_no_registrada"]).optional(),
    }),
  ),
});

// Si cierra, redirige al evento y el cliente no recibe nada; si no, recibe el motivo.
export async function cerrarEventoAccion(datos: unknown): Promise<{ error: string } | undefined> {
  const yo = await exigirPermiso("operar");
  const cierre = CierreDeEvento.safeParse(datos);
  if (!cierre.success) return { error: "El conteo tiene valores que no son cantidades válidas. Revisá que no haya negativos ni decimales." };
  const resultado = await cerrarEvento(cierre.data.eventoId, cierre.data.conteo, cierre.data.destinoId, yo.id);
  if (!resultado.ok) return { error: resultado.motivo };
  const faltan = resultado.diferencias.filter((d) => d.diferencia < 0).reduce((s, d) => s - d.diferencia, 0);
  const sobran = resultado.diferencias.filter((d) => d.diferencia > 0).reduce((s, d) => s + d.diferencia, 0);
  await registrarAuditoria(
    yo.id,
    "Eventos",
    `Cerró el evento ${await nombreDeEvento(cierre.data.eventoId)}: ${resultado.diferencias.length} diferencias (faltan ${faltan}, sobran ${sobran}). El remanente volvió a ${await nombreDeUbicacion(cierre.data.destinoId)}`,
  );
  revalidatePath("/panel", "layout");
  redirect(`/panel/eventos/${cierre.data.eventoId}`);
}

// --- Ventas ---

// Una venta para revisar ya entró (la plata se cobró). Revisarla es dejar asentado qué se concluyó.
export async function marcarRevisadaAccion(ventaId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const nota = texto("Contá qué se concluyó, por ejemplo “redondeo acordado con el cliente”").safeParse(formulario.get("nota"));
  if (!nota.success) return { error: primerError(nota.error) };
  if (!(await marcarRevisada(id.parse(ventaId), yo.id, nota.data))) return { error: "Esa venta no está pendiente de revisión: alguien ya la revisó." };
  await registrarAuditoria(yo.id, "Ventas", `Revisó la venta #${ventaId}: ${nota.data}`);
  revalidatePath("/panel", "layout");
  return { exito: "Venta marcada como revisada" };
}

// --- Libro mayor ---

// stock_actual es una copia para leer rápido; la verdad son los movimientos. Si alguna vez no
// coinciden, la copia se reconstruye entera desde el libro mayor.
export async function verificarStockAccion(): Promise<EstadoFormulario> {
  await exigirPermiso("ver");
  const descuadres = await verificarStock();
  if (descuadres.length === 0) return { exito: "El stock cuadra con el libro mayor: no hay nada que corregir." };
  const detalle = descuadres
    .slice(0, 5)
    .map((d) => `variante ${d.varianteId} en ubicación ${d.ubicacionId}: dice ${d.materializado ?? "nada"}, los movimientos dan ${d.segunMovimientos ?? 0}`)
    .join("; ");
  return {
    error: `Hay ${descuadres.length} ${descuadres.length === 1 ? "descuadre" : "descuadres"} (${detalle}${descuadres.length > 5 ? "; …" : ""}). Un administrador tiene que tocar “Recalcular desde los movimientos”.`,
  };
}

export async function recalcularStockAccion(): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const filas = await recalcularStock();
  await registrarAuditoria(yo.id, "Stock", `Reconstruyó el stock desde los movimientos (${filas} filas)`);
  revalidatePath("/panel", "layout");
  return { exito: `Listo: el stock se reconstruyó desde los movimientos (${filas} filas). Ningún movimiento se tocó.` };
}

// --- Catálogo ---

const lista = (mensaje: string) =>
  z
    .string()
    .transform((s) => [...new Set(s.split(",").map((parte) => parte.trim()).filter(Boolean))])
    .pipe(z.array(z.string().max(40)).min(1, mensaje));

const NuevoProducto = z.object({
  nombre: texto("Poné el nombre del producto"),
  marca: texto("Poné la marca"),
  categoria: texto("Poné la categoría"),
  talles: lista("Poné al menos un talle. Si no tiene, escribí Único"),
  colores: lista("Poné al menos un color. En nutrición va el sabor"),
  precio: pesos("El precio tiene que ser un número de pesos, sin puntos"),
});

export async function crearProductoAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = NuevoProducto.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const { talles, colores, precio, ...producto } = datos.data;
  if (talles.length * colores.length > 99) return { error: "Son demasiadas combinaciones de talle y color: el máximo es 99 por producto" };

  const creado = await crearProducto({ ...producto, variantes: colores.flatMap((color) => talles.map((talle) => ({ talle, color, precio }))) });
  await registrarAuditoria(yo.id, "Catálogo", `Creó ${producto.nombre} (${producto.marca}) con ${creado.variantes.length} variantes a $${precio}`);
  revalidatePath("/panel/catalogo", "layout");
  return { exito: `Se creó ${producto.nombre} con ${creado.variantes.length} variantes` };
}

const NuevaVariante = z.object({
  talle: texto("Poné el talle"),
  color: texto("Poné el color"),
  precio: pesos("El precio tiene que ser un número de pesos, sin puntos"),
});

export async function agregarVarianteAccion(productoId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = NuevaVariante.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const variante = await agregarVariante(id.parse(productoId), datos.data);
  await registrarAuditoria(yo.id, "Catálogo", `Agregó la variante ${await nombreDeVariante(variante.id)} a $${variante.precio}`);
  revalidatePath("/panel/catalogo", "layout");
  return { exito: `Variante agregada con SKU ${variante.sku}` };
}

export async function cambiarPrecioAccion(varianteId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const precio = pesos("El precio tiene que ser un número de pesos, sin puntos").safeParse(formulario.get("precio"));
  if (!precio.success) return { error: primerError(precio.error) };
  const [antes] = await db().select({ precio: variantes.precio }).from(variantes).where(eq(variantes.id, id.parse(varianteId)));
  if (!antes) return { error: "La variante no existe. Recargá la página." };
  if (antes.precio === precio.data) return { exito: "El precio ya era ese" };
  await actualizarVariante(id.parse(varianteId), { precio: precio.data });
  await registrarAuditoria(yo.id, "Catálogo", `Cambió el precio de ${await nombreDeVariante(varianteId)}: $${antes.precio} → $${precio.data}`);
  revalidatePath("/panel/catalogo", "layout");
  return { exito: "Precio guardado" };
}

export async function cambiarVarianteActivaAccion(varianteId: number, activo: boolean) {
  const yo = await exigirPermiso("operar");
  await actualizarVariante(id.parse(varianteId), { activo: z.boolean().parse(activo) });
  await registrarAuditoria(yo.id, "Catálogo", `${activo ? "Reactivó" : "Desactivó"} ${await nombreDeVariante(varianteId)}`);
  revalidatePath("/panel/catalogo", "layout");
}

const DatosDeProducto = z.object({
  nombre: texto("Poné el nombre del producto"),
  marca: texto("Poné la marca"),
  categoria: texto("Poné la categoría"),
});

export async function editarProductoAccion(productoId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = DatosDeProducto.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [antes] = await db().select().from(productos).where(eq(productos.id, id.parse(productoId)));
  if (!antes) return { error: "El producto no existe. Recargá la página." };
  await actualizarProducto(antes.id, datos.data);
  await registrarAuditoria(
    yo.id,
    "Catálogo",
    `Editó el producto ${antes.id}: ${antes.nombre} / ${antes.marca} / ${antes.categoria} → ${datos.data.nombre} / ${datos.data.marca} / ${datos.data.categoria}`,
  );
  revalidatePath("/panel/catalogo", "layout");
  return { exito: "Producto guardado. Los celulares lo ven con el nombre nuevo cuando actualicen el paquete." };
}

export async function cambiarProductoActivoAccion(productoId: number, activo: boolean) {
  const yo = await exigirPermiso("operar");
  await actualizarProducto(id.parse(productoId), { activo: z.boolean().parse(activo) });
  await registrarAuditoria(yo.id, "Catálogo", `${activo ? "Reactivó" : "Desactivó"} el producto ${await nombreDeProducto(productoId)}`);
  revalidatePath("/panel/catalogo", "layout");
}

const Ingreso = z.object({
  sku: texto("Poné el SKU de la variante que entra"),
  cantidad: z.coerce
    .number({ error: "La cantidad tiene que ser un número" })
    .int("La cantidad va sin decimales")
    .positive("La cantidad tiene que ser mayor a 0")
    .max(9999),
  ubicacionId: id,
});

export async function ingresarMercaderiaAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = Ingreso.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [variante] = await db().select({ id: variantes.id }).from(variantes).where(eq(variantes.sku, datos.data.sku));
  if (!variante) return { error: `No hay ninguna variante con SKU ${datos.data.sku}. Buscalo en Catálogo.` };
  await registrarIngreso(datos.data.ubicacionId, [{ varianteId: variante.id, cantidad: datos.data.cantidad }], { usuarioId: yo.id });
  const nombre = await nombreDeVariante(variante.id);
  await registrarAuditoria(yo.id, "Stock", `Ingresó ${datos.data.cantidad} × ${nombre} en ${await nombreDeUbicacion(datos.data.ubicacionId)}`);
  revalidatePath("/panel", "layout");
  return { exito: `Ingresaron ${datos.data.cantidad} × ${nombre}` };
}

// --- Ubicaciones ---

const NuevaUbicacion = z.object({
  nombre: texto("Poné el nombre de la ubicación"),
  tipo: z.enum(["deposito", "showroom", "web"], { error: "Elegí el tipo de ubicación" }),
});

export async function crearUbicacionAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = NuevaUbicacion.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [repetida] = await db().select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.nombre, datos.data.nombre));
  if (repetida) return { error: `Ya existe una ubicación llamada ${datos.data.nombre}` };
  await crearUbicacion(datos.data.nombre, datos.data.tipo);
  await registrarAuditoria(yo.id, "Ubicaciones", `Creó la ubicación ${datos.data.nombre} (${datos.data.tipo})`);
  revalidatePath("/panel/ubicaciones");
  return { exito: `Se creó ${datos.data.nombre}` };
}

export async function renombrarUbicacionAccion(ubicacionId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const nombre = texto("Poné el nombre de la ubicación").safeParse(formulario.get("nombre"));
  if (!nombre.success) return { error: primerError(nombre.error) };
  const [repetida] = await db()
    .select({ id: ubicaciones.id })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.nombre, nombre.data), ne(ubicaciones.id, id.parse(ubicacionId))));
  if (repetida) return { error: `Ya existe una ubicación llamada ${nombre.data}` };
  const antes = await nombreDeUbicacion(id.parse(ubicacionId));
  await renombrarUbicacion(id.parse(ubicacionId), nombre.data);
  await registrarAuditoria(yo.id, "Ubicaciones", `Renombró ${antes} → ${nombre.data}`);
  revalidatePath("/panel/ubicaciones");
  return { exito: "Nombre guardado" };
}

export async function cambiarUbicacionActivaAccion(ubicacionId: number, activa: boolean) {
  const yo = await exigirPermiso("operar");
  await cambiarUbicacionActiva(id.parse(ubicacionId), z.boolean().parse(activa));
  await registrarAuditoria(yo.id, "Ubicaciones", `${activa ? "Reactivó" : "Desactivó"} la ubicación ${await nombreDeUbicacion(ubicacionId)}`);
  revalidatePath("/panel/ubicaciones");
}

// --- Celulares ---

export async function crearDispositivoAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("administrar");
  const nombre = texto("Poné un nombre que identifique al celular, por ejemplo “Celular de Juan”").safeParse(formulario.get("nombre"));
  if (!nombre.success) return { error: primerError(nombre.error) };
  const { codigo } = await crearDispositivo(nombre.data);
  await registrarAuditoria(yo.id, "Celulares", `Generó un código de alta para ${nombre.data}`);
  revalidatePath("/panel/dispositivos");
  // El código vuelve una sola vez, en la respuesta: no queda en la URL, ni en la base, ni en la auditoría.
  return { codigo };
}

export async function revocarDispositivoAccion(dispositivoId: number) {
  const yo = await exigirPermiso("administrar");
  const [celular] = await db().select({ nombre: dispositivos.nombre }).from(dispositivos).where(eq(dispositivos.id, id.parse(dispositivoId)));
  await revocarDispositivo(id.parse(dispositivoId));
  await registrarAuditoria(yo.id, "Celulares", `Revocó el celular ${celular?.nombre ?? dispositivoId}`);
  revalidatePath("/panel/dispositivos");
}
