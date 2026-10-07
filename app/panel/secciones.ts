import type { Permiso } from "@/contrato/permisos";

// El mapa del panel: qué secciones hay, en qué grupo y qué permiso pide cada una.
// La barra lateral y el buscador lo leen de acá.

export type Seccion = { href: string; nombre: string; descripcion: string; permiso: Permiso; contador?: "eventos" | "revisar" | "pendientes" };

export const GRUPOS: { titulo: string | null; secciones: Seccion[] }[] = [
  { titulo: null, secciones: [{ href: "/panel", nombre: "Inicio", descripcion: "Tablero del día", permiso: "ver" }] },
  {
    titulo: "Operación",
    secciones: [
      { href: "/panel/eventos", nombre: "Eventos", descripcion: "Preparar, seguir y cerrar eventos", permiso: "ver", contador: "eventos" },
      { href: "/panel/ventas", nombre: "Ventas", descripcion: "Todas las ventas de todos los eventos", permiso: "ver", contador: "revisar" },
      { href: "/panel/transferencias", nombre: "Transferencias", descripcion: "Mover mercadería entre ubicaciones", permiso: "operar" },
    ],
  },
  {
    titulo: "Stock",
    secciones: [
      { href: "/panel/stock", nombre: "Stock", descripcion: "Stock actual por ubicación", permiso: "ver" },
      { href: "/panel/movimientos", nombre: "Movimientos", descripcion: "Libro mayor: cada entrada y salida", permiso: "ver" },
      { href: "/panel/compras", nombre: "Compras", descripcion: "Mercadería que entra de proveedores, con costo", permiso: "ver" },
      { href: "/panel/proveedores", nombre: "Proveedores", descripcion: "A quién le compramos y qué", permiso: "ver" },
      { href: "/panel/catalogo", nombre: "Catálogo", descripcion: "Productos, talles, colores y precios", permiso: "ver" },
      { href: "/panel/ubicaciones", nombre: "Ubicaciones", descripcion: "Depósitos, showrooms y web", permiso: "ver" },
    ],
  },
  {
    titulo: "Análisis",
    secciones: [{ href: "/panel/reportes", nombre: "Reportes", descripcion: "Rankings, talles, vendedores y stock", permiso: "ver" }],
  },
  {
    titulo: "Administración",
    secciones: [
      { href: "/panel/usuarios", nombre: "Usuarios", descripcion: "Personas, roles, claves y PIN", permiso: "administrar" },
      { href: "/panel/dispositivos", nombre: "Celulares", descripcion: "Alta y baja de celulares de venta", permiso: "administrar", contador: "pendientes" },
      { href: "/panel/auditoria", nombre: "Auditoría", descripcion: "Quién hizo qué y cuándo", permiso: "administrar" },
    ],
  },
];
