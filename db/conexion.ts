import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as esquema from "@/db/esquema";

// El tipo común a postgres-js (producción) y PGlite (arnés de verificación).
export type BaseDeDatos = PgDatabase<PgQueryResultHKT, typeof esquema>;

declare global {
  // El dev server de Next recarga módulos en cada cambio: sin esto abre un pool nuevo por recarga
  // hasta que Supabase corta por límite de conexiones. El arnés inyecta acá su base embebida.
  var baseDeDatosEstilofit: BaseDeDatos | undefined;
}

// Se arma en el primer uso, no al importar: en `next build` se cargan estos módulos sin DATABASE_URL.
export function db(): BaseDeDatos {
  if (globalThis.baseDeDatosEstilofit) return globalThis.baseDeDatosEstilofit;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Falta DATABASE_URL en .env.local (pooler de Supabase en modo transaction)");

  // El pooler de Supabase en modo transaction no soporta prepared statements.
  const cliente = postgres(url, { prepare: false });
  const instancia = drizzle(cliente, { schema: esquema, casing: "snake_case" });
  globalThis.baseDeDatosEstilofit = instancia;
  return instancia;
}
