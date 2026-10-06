import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["verificacion/**/*.test.ts"],
    setupFiles: ["verificacion/entorno.ts"],
    environment: "node",
    // Levantar Postgres en WASM y migrar tarda un par de segundos por base.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
