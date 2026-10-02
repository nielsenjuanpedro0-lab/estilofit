import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as esquema from "@/db/esquema";
import { productos } from "@/db/esquema";
import { sembrar } from "@/db/semilla";

// Base local para desarrollar y probar sin Supabase: el mismo Postgres embebido del arnés,
// guardado en .base-local/ y servido por el protocolo de Postgres. La app se conecta con
// DATABASE_URL igual que en producción. Solo para desarrollo.

const PUERTO = 5433;

const pg = await PGlite.create(".base-local");
const base = drizzle(pg, { schema: esquema, casing: "snake_case" });
await migrate(base, { migrationsFolder: "db/migraciones" });

globalThis.baseDeDatosEstilofit = base;
if ((await base.$count(productos)) === 0) {
  await sembrar();
  console.log("Base vacía: se cargó la semilla.");
}

// Una sola conexión a la vez: con varias, el multiplexor de pglite-socket mezcla los parámetros
// de consultas concurrentes ("bind message supplies 6 parameters…"). Postgres real no tiene ese problema.
// Por eso la URL local lleva ?max=1: postgres.js abre una sola conexión y encola el resto.
const servidor = new PGLiteSocketServer({ db: pg, host: "127.0.0.1", port: PUERTO, maxConnections: 1 });
await servidor.start();
console.log(`Base local escuchando. En .env.local: DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres?max=1`);
