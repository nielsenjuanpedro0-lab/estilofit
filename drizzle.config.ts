import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/esquema.ts",
  out: "./db/migraciones",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRACIONES ?? "",
  },
});
