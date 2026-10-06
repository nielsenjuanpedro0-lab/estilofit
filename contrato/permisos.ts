// Qué puede hacer cada rol. Lo usan el servidor (que es el que manda) y la interfaz (que solo
// esconde lo que de todos modos el servidor rechazaría).

export const ROLES = ["administrador", "encargado", "consulta", "vendedor"] as const;
export type Rol = (typeof ROLES)[number];

// ver: mirar todo el panel. operar: mover stock, catálogo, eventos y cierres. administrar: usuarios,
// celulares, auditoría y reconstruir el stock.
export type Permiso = "ver" | "operar" | "administrar";

const PERMISOS: Record<Rol, readonly Permiso[]> = {
  administrador: ["ver", "operar", "administrar"],
  encargado: ["ver", "operar"],
  consulta: ["ver"],
  // Vende desde el celular con su PIN. No entra al panel.
  vendedor: [],
};

export function puede(rol: Rol, permiso: Permiso) {
  return PERMISOS[rol].includes(permiso);
}

export const NOMBRE_DE_ROL: Record<Rol, string> = {
  administrador: "Administrador",
  encargado: "Encargado",
  consulta: "Consulta",
  vendedor: "Vendedor",
};

export const DESCRIPCION_DE_ROL: Record<Rol, string> = {
  administrador: "Todo, incluidos usuarios, celulares y auditoría.",
  encargado: "Stock, catálogo, transferencias, eventos y cierres.",
  consulta: "Mira stock, ventas y reportes. No cambia nada.",
  vendedor: "Solo vende desde el celular, con su PIN.",
};
