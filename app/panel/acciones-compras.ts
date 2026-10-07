"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { id, primerError, texto, type EstadoFormulario } from "@/app/panel/validacion";
import { pesos } from "@/componentes/formato";
import { db } from "@/db/conexion";
import { compras, productos, proveedores, variantes } from "@/db/esquema";
import { exigirPermiso } from "@/servidor/acceso";
import { registrarAuditoria } from "@/servidor/auditoria";
import { anularCompra, registrarCompra } from "@/servidor/compras";
import { cambiarProveedorActivo, crearProveedor, editarProveedor, nombreDeProveedorEnUso } from "@/servidor/proveedores";

// Proveedores y compras. Mirar pide "ver"; cargar, editar y anular, "operar". Cada cambio queda en
// la auditoría con nombres, no números.

const opcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((s) => (s === "" ? null : s));

const DatosDeProveedor = z.object({
  nombre: texto("Poné el nombre del proveedor"),
  cuit: opcional(20),
  telefono: opcional(40),
  email: opcional(120).pipe(z.email("El email no es válido").nullable()),
  nota: opcional(500),
});

export async function crearProveedorAccion(_previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = DatosDeProveedor.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  if (await nombreDeProveedorEnUso(datos.data.nombre, null)) return { error: `Ya hay un proveedor llamado ${datos.data.nombre}` };
  const proveedor = await crearProveedor(datos.data);
  await registrarAuditoria(yo.id, "Compras", `Creó el proveedor ${proveedor.nombre}`);
  revalidatePath("/panel/proveedores", "layout");
  return { exito: `Se creó ${proveedor.nombre}` };
}

export async function editarProveedorAccion(proveedorId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const datos = DatosDeProveedor.safeParse(Object.fromEntries(formulario));
  if (!datos.success) return { error: primerError(datos.error) };
  const [antes] = await db().select().from(proveedores).where(eq(proveedores.id, id.parse(proveedorId)));
  if (!antes) return { error: "El proveedor no existe. Recargá la página." };
  if (await nombreDeProveedorEnUso(datos.data.nombre, antes.id)) return { error: `Ya hay un proveedor llamado ${datos.data.nombre}` };
  await editarProveedor(antes.id, datos.data);
  await registrarAuditoria(yo.id, "Compras", `Editó el proveedor ${antes.nombre}${antes.nombre !== datos.data.nombre ? ` → ${datos.data.nombre}` : ""}`);
  revalidatePath("/panel/proveedores", "layout");
  return { exito: "Proveedor guardado" };
}

export async function cambiarProveedorActivoAccion(proveedorId: number, activo: boolean) {
  const yo = await exigirPermiso("operar");
  const [p] = await db().select({ nombre: proveedores.nombre }).from(proveedores).where(eq(proveedores.id, id.parse(proveedorId)));
  if (!p) return;
  await cambiarProveedorActivo(proveedorId, z.boolean().parse(activo));
  await registrarAuditoria(yo.id, "Compras", `${activo ? "Reactivó" : "Desactivó"} el proveedor ${p.nombre}`);
  revalidatePath("/panel/proveedores", "layout");
}

const CompraDelFormulario = z.object({
  clientUuid: z.uuid("Recargá la página y volvé a cargar la compra"),
  proveedorId: z.number({ error: "Elegí el proveedor" }).int().positive("Elegí el proveedor"),
  ubicacionId: z.number({ error: "Elegí a dónde entra" }).int().positive("Elegí a dónde entra"),
  fecha: z.string().date("Elegí la fecha del comprobante"),
  comprobante: opcional(100),
  nota: opcional(500),
  items: z
    .array(
      z.object({
        varianteId: id,
        cantidad: z.number().int("La cantidad va sin decimales").positive("La cantidad tiene que ser mayor a 0").max(9999, "La cantidad máxima por renglón es 9999"),
        costoUnitario: z.number({ error: "El costo tiene que ser un número" }).nonnegative("El costo no puede ser negativo").max(99_999_999),
      }),
    )
    .min(1, "Agregá al menos un producto a la compra"),
});

export async function registrarCompraAccion(datos: unknown): Promise<{ ok: true; compraId: number } | { ok: false; error: string }> {
  const yo = await exigirPermiso("operar");
  const compra = CompraDelFormulario.safeParse(datos);
  if (!compra.success) return { ok: false, error: primerError(compra.error) };
  const r = await registrarCompra({ ...compra.data, usuarioId: yo.id });
  if (!r.ok) return { ok: false, error: r.motivo };
  if (!r.repetida) {
    const [p] = await db().select({ nombre: proveedores.nombre }).from(proveedores).where(eq(proveedores.id, compra.data.proveedorId));
    const unidades = compra.data.items.reduce((s, i) => s + i.cantidad, 0);
    const total = compra.data.items.reduce((s, i) => s + Math.round(i.costoUnitario * 100) * i.cantidad, 0) / 100;
    await registrarAuditoria(
      yo.id,
      "Compras",
      `Cargó la compra #${r.compraId} de ${p?.nombre ?? "proveedor"}: ${unidades} unidades por ${pesos(total)}${compra.data.comprobante ? ` (${compra.data.comprobante})` : ""}`,
    );
  }
  revalidatePath("/panel", "layout");
  return { ok: true, compraId: r.compraId };
}

export async function anularCompraAccion(compraId: number, _previo: EstadoFormulario, formulario: FormData): Promise<EstadoFormulario> {
  const yo = await exigirPermiso("operar");
  const motivo = texto("Contá por qué se anula la compra").safeParse(formulario.get("motivo") ?? "");
  if (!motivo.success) return { error: primerError(motivo.error) };
  const r = await anularCompra(id.parse(compraId), yo.id, motivo.data);
  if (!r.ok) {
    if (r.faltantes.length === 0) return { error: r.motivo };
    const nombres = await db()
      .select({ id: variantes.id, nombre: productos.nombre, talle: variantes.talle, color: variantes.color })
      .from(variantes)
      .innerJoin(productos, eq(productos.id, variantes.productoId))
      .where(inArray(variantes.id, r.faltantes.map((f) => f.varianteId)));
    const nombre = new Map(nombres.map((n) => [n.id, `${n.nombre} ${n.talle} ${n.color}`]));
    const detalle = r.faltantes.map((f) => `${nombre.get(f.varianteId)}: entraron ${f.pedido}, quedan ${f.disponible}`).join("; ");
    return { error: `No se anuló: ${r.motivo} (${detalle}). Traé esa mercadería de vuelta con una transferencia y volvé a anular.` };
  }
  const [c] = await db()
    .select({ proveedor: proveedores.nombre })
    .from(compras)
    .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
    .where(eq(compras.id, compraId));
  await registrarAuditoria(yo.id, "Compras", `Anuló la compra #${compraId} de ${c?.proveedor ?? "proveedor"}: ${motivo.data}`);
  revalidatePath("/panel", "layout");
  return { exito: "Compra anulada. El stock salió del destino; el costo de las variantes queda como estaba hasta la próxima compra." };
}
