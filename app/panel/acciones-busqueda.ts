"use server";

import { z } from "zod";
import { puede } from "@/contrato/permisos";
import { exigirPermiso } from "@/servidor/acceso";
import { buscar } from "@/servidor/busqueda";

export async function buscarAccion(texto: unknown) {
  const yo = await exigirPermiso("ver");
  const q = z.string().max(100).safeParse(texto);
  if (!q.success) return [];
  return buscar(q.data, puede(yo.rol, "administrar"));
}
