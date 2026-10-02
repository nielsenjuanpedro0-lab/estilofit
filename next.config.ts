import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Hay un package-lock.json suelto en el home del usuario y Next lo toma como raíz del workspace.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
