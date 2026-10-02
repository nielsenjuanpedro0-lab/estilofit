import { sembrar } from "@/db/semilla";

await sembrar();
console.log("Semilla cargada.");
// postgres.js deja el pool abierto y el proceso no terminaría solo.
process.exit(0);
