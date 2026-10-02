import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as esquema from "@/db/esquema";

// Un Postgres real embebido en WASM, con las mismas migraciones que Supabase.
// La instancia se inyecta donde la busca db(), así el código de la app corre tal cual es.
export async function levantarBaseEmbebida() {
  const pg = new PGlite();
  const base = drizzle(pg, { schema: esquema, casing: "snake_case" });
  await migrate(base, { migrationsFolder: "db/migraciones" });
  globalThis.baseDeDatosEstilofit = base;

  return {
    base,
    // Para lo que no pasa por Drizzle: llamar funciones de la base y romper cosas a propósito.
    async consultar<Fila>(texto: string, parametros: unknown[] = []): Promise<Fila[]> {
      const resultado = await pg.query<Fila>(texto, parametros);
      return resultado.rows;
    },
    async consultarUno<Fila>(texto: string, parametros: unknown[] = []): Promise<Fila> {
      const resultado = await pg.query<Fila>(texto, parametros);
      const [fila, ...resto] = resultado.rows;
      if (!fila || resto.length > 0) throw new Error(`Se esperaba una fila y vinieron ${resultado.rows.length}: ${texto}`);
      return fila;
    },
    async cerrar() {
      globalThis.baseDeDatosEstilofit = undefined;
      await pg.close();
    },
  };
}
