import { z } from "zod";

// Piezas de validación que comparten las server actions del panel. Viven acá porque un archivo
// "use server" solo puede exportar funciones async.

export type EstadoFormulario = { error?: string; exito?: string; codigo?: string } | null;

export function primerError(error: z.ZodError) {
  return error.issues[0]?.message ?? "Revisá los datos del formulario";
}

export const texto = (mensaje: string) => z.string().trim().min(1, mensaje).max(200);
export const pesos = (mensaje: string) => z.coerce.number({ error: mensaje }).nonnegative(mensaje).max(99_999_999, mensaje);
export const id = z.coerce.number().int().positive();
