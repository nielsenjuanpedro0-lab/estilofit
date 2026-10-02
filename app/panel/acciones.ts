"use server";

import { eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/conexion";
import { eventos, productos, ubicaciones, variantes } from "@/db/esquema";
import {
  actualizarProducto,
  actualizarVariante,
  agregarVariante,
  cambiarUbicacionActiva,
  crearProducto,
  crearUbicacion,
  registrarIngreso,
} from "@/servidor/catalogo";
import { cerrarEvento } from "@/servidor/cierre";
import { crearDispositivo, revocarDispositivo } from "@/servidor/dispositivos";
import { abrirEvento, crearEvento } from "@/servidor/eventos";
import { COOKIE_SESION, exigirSesionPanel } from "@/servidor/sesion-panel";
import { transferir } from "@/servidor/transferencias";

// Todo lo que llega acá viene de un formulario o de un POST que cualquiera puede armar:
// se exige sesión y se valida con Zod antes de tocar la base.

export type EstadoFormulario = { error?: string; exito?: string; codigo?: string } | null;

function primerError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisá los datos del formulario";
}

const texto = (mensaje: string) => z.string().trim().min(1, mensaje).max(200);
const pesos = (mensaje: string) => z.coerce.number({ error: mensaje }).nonnegative(mensaje).max(99_999_999, mensaje);
const id = z.coerce.number().int().positive();

export async function salir() {
  (await cookies()).delete(COOKIE_SESION);
  redirect("/ingresar");
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
  await exigirSesionPanel();
  const datos = NuevoEvento.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };

  const nombreUbicacion = `${datos.data.nombre} · ${datos.data.fechaDesde}`;
  const [repetida] = await db().select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.nombre, nombreUbicacion));
  if (repetida) return { error: "Ya hay un evento con ese nombre en esa fecha. Si es un segundo equipo, agregale “Equipo 2” al nombre." };

  const evento = await crearEvento(datos.data);
  redirect(`/panel/eventos/${evento.id}`);
}

export async function abrirEventoAccion(eventoId: number) {
  await exigirSesionPanel();
  await abrirEvento(id.parse(eventoId));
  revalidatePath(`/panel/eventos/${eventoId}`);
}

const CargaDeViaje = z.object({
  eventoId: id,
  origenId: id,
  items: z
    .array(z.object({ varianteId: id, cantidad: z.number().int().positive().max(9999) }))
    .min(1, "Elegí al menos una variante con cantidad"),
});

export async function cargarViaje(datos: unknown): Promise<{ ok: true; unidades: number } | { ok: false; error: string }> {
  await exigirSesionPanel();
  const carga = CargaDeViaje.safeParse(datos);
  if (!carga.success) return { ok: false, error: primerError(carga.error) };
  const [evento] = await db().select().from(eventos).where(eq(eventos.id, carga.data.eventoId));
  if (!evento) return { ok: false, error: "El evento no existe" };
  if (evento.estado === "cerrado") return { ok: false, error: "El evento ya está cerrado: no se le puede cargar stock" };

  // La misma variante cargada dos veces en la lista se suma en un solo renglón.
  const porVariante = new Map<number, number>();
  for (const item of carga.data.items) porVariante.set(item.varianteId, (porVariante.get(item.varianteId) ?? 0) + item.cantidad);
  const items = [...porVariante].map(([varianteId, cantidad]) => ({ varianteId, cantidad }));

  if (carga.data.origenId === evento.ubicacionId) return { ok: false, error: "El origen no puede ser el mismo evento" };
  const resultado = await transferir({ origenId: carga.data.origenId, destinoId: evento.ubicacionId, items, nota: `Viaje a ${evento.nombre}` });
  if (!resultado.ok) {
    const nombres = await db()
      .select({ id: variantes.id, nombre: productos.nombre, talle: variantes.talle, color: variantes.color })
      .from(variantes)
      .innerJoin(productos, eq(productos.id, variantes.productoId))
      .where(inArray(variantes.id, resultado.faltantes.map((f) => f.varianteId)));
    const nombre = new Map(nombres.map((n) => [n.id, `${n.nombre} ${n.talle} ${n.color}`]));
    const detalle = resultado.faltantes.map((f) => `${nombre.get(f.varianteId)}: pediste ${f.pedido}, hay ${f.disponible}`).join("; ");
    return { ok: false, error: `No se cargó nada: falta stock en el origen (${detalle}). Bajá esas cantidades y volvé a confirmar.` };
  }
  revalidatePath(`/panel/eventos/${carga.data.eventoId}`);
  return { ok: true, unidades: items.reduce((suma, i) => suma + i.cantidad, 0) };
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
  await exigirSesionPanel();
  const cierre = CierreDeEvento.safeParse(datos);
  if (!cierre.success) return { error: "El conteo tiene valores que no son cantidades válidas. Revisá que no haya negativos ni decimales." };
  const resultado = await cerrarEvento(cierre.data.eventoId, cierre.data.conteo, cierre.data.destinoId);
  if (!resultado.ok) return { error: resultado.motivo };
  revalidatePath("/panel");
  revalidatePath("/panel/eventos");
  redirect(`/panel/eventos/${cierre.data.eventoId}`);
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
  await exigirSesionPanel();
  const datos = NuevoProducto.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const { talles, colores, precio, ...producto } = datos.data;
  if (talles.length * colores.length > 99) return { error: "Son demasiadas combinaciones de talle y color: el máximo es 99 por producto" };

  await crearProducto({ ...producto, variantes: colores.flatMap((color) => talles.map((talle) => ({ talle, color, precio }))) });
  revalidatePath("/panel/catalogo");
  return { exito: `Se creó ${producto.nombre} con ${talles.length * colores.length} variantes` };
}

const NuevaVariante = z.object({
  talle: texto("Poné el talle"),
  color: texto("Poné el color"),
  precio: pesos("El precio tiene que ser un número de pesos, sin puntos"),
});

export async function agregarVarianteAccion(productoId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  await exigirSesionPanel();
  const datos = NuevaVariante.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const variante = await agregarVariante(id.parse(productoId), datos.data);
  revalidatePath("/panel/catalogo");
  return { exito: `Variante agregada con SKU ${variante.sku}` };
}

export async function cambiarPrecioAccion(varianteId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  await exigirSesionPanel();
  const precio = pesos("El precio tiene que ser un número de pesos, sin puntos").safeParse(formulario.get("precio"));
  if (!precio.success) return { error: primerError(precio.error) };
  await actualizarVariante(id.parse(varianteId), { precio: precio.data });
  revalidatePath("/panel/catalogo");
  return { exito: "Precio guardado" };
}

export async function cambiarVarianteActivaAccion(varianteId: number, activo: boolean) {
  await exigirSesionPanel();
  await actualizarVariante(id.parse(varianteId), { activo: z.boolean().parse(activo) });
  revalidatePath("/panel/catalogo");
}

export async function cambiarProductoActivoAccion(productoId: number, activo: boolean) {
  await exigirSesionPanel();
  await actualizarProducto(id.parse(productoId), { activo: z.boolean().parse(activo) });
  revalidatePath("/panel/catalogo");
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
  await exigirSesionPanel();
  const datos = Ingreso.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [variante] = await db()
    .select({ id: variantes.id, nombre: productos.nombre, talle: variantes.talle, color: variantes.color })
    .from(variantes)
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .where(eq(variantes.sku, datos.data.sku));
  if (!variante) return { error: `No hay ninguna variante con SKU ${datos.data.sku}. Fijate el SKU en la lista de abajo.` };
  await registrarIngreso(datos.data.ubicacionId, [{ varianteId: variante.id, cantidad: datos.data.cantidad }]);
  revalidatePath("/panel");
  revalidatePath("/panel/catalogo");
  return { exito: `Ingresaron ${datos.data.cantidad} × ${variante.nombre} ${variante.talle} ${variante.color}` };
}

// --- Ubicaciones ---

const NuevaUbicacion = z.object({
  nombre: texto("Poné el nombre de la ubicación"),
  tipo: z.enum(["deposito", "showroom", "web"], { error: "Elegí el tipo de ubicación" }),
});

export async function crearUbicacionAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  await exigirSesionPanel();
  const datos = NuevaUbicacion.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [repetida] = await db().select({ id: ubicaciones.id }).from(ubicaciones).where(eq(ubicaciones.nombre, datos.data.nombre));
  if (repetida) return { error: `Ya existe una ubicación llamada ${datos.data.nombre}` };
  await crearUbicacion(datos.data.nombre, datos.data.tipo);
  revalidatePath("/panel/ubicaciones");
  return { exito: `Se creó ${datos.data.nombre}` };
}

export async function cambiarUbicacionActivaAccion(ubicacionId: number, activa: boolean) {
  await exigirSesionPanel();
  await cambiarUbicacionActiva(id.parse(ubicacionId), z.boolean().parse(activa));
  revalidatePath("/panel/ubicaciones");
}

// --- Dispositivos ---

export async function crearDispositivoAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  await exigirSesionPanel();
  const nombre = texto("Poné un nombre que identifique al celular, por ejemplo “Celular de Juan”").safeParse(formulario.get("nombre"));
  if (!nombre.success) return { error: primerError(nombre.error) };
  const { codigo } = await crearDispositivo(nombre.data);
  revalidatePath("/panel/dispositivos");
  // El código vuelve una sola vez, en la respuesta: no queda en la URL ni en la base.
  return { codigo };
}

export async function revocarDispositivoAccion(dispositivoId: number) {
  await exigirSesionPanel();
  await revocarDispositivo(id.parse(dispositivoId));
  revalidatePath("/panel/dispositivos");
}
