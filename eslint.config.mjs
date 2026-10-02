import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const configuracion = [
  { ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts", "db/migraciones/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // Las reglas de "cómo se escribe el código acá" que se pueden chequear con una máquina.
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["**/utils", "**/utils/*"], message: "Sin carpeta utils: poné la función donde se usa." }] },
      ],
    },
  },
];

export default configuracion;
