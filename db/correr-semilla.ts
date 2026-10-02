import { db } from "@/db/conexion";
import { sembrar } from "@/db/semilla";

await sembrar(db());
console.log("Semilla cargada.");
// postgres.js deja el pool abierto y el proceso no terminaría solo.
process.exit(0);
