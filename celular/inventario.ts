import type { EventoBajado, VarianteBajada, VentaLocal } from "@/celular/almacen";

export type VarianteEnGrilla = { varianteId: number; talle: string; color: string; sku: string; precio: number; stock: number };

export type ProductoEnGrilla = {
  productoId: number;
  nombre: string;
  marca: string;
  categoria: string;
  precio: number;
  imagen: Blob | null;
  stock: number;
  vendidas: number;
  variantes: VarianteEnGrilla[];
};

// El paquete trae una foto del servidor. Las ventas que ya estaban confirmadas al bajarlo vienen
// contadas en esa foto; todas las demás (pendientes, rechazadas o confirmadas después) se restan acá.
function yaContadaEnElPaquete(venta: VentaLocal, evento: EventoBajado) {
  return venta.estado === "confirmada" && venta.confirmadaEn !== null && venta.confirmadaEn <= evento.descargadoEn;
}

// Grilla de venta: productos ordenados por lo más vendido en este evento, con el stock que queda.
export function armarGrilla(evento: EventoBajado, variantes: VarianteBajada[], ventas: VentaLocal[]): ProductoEnGrilla[] {
  const vendidasLocales = new Map<number, number>();
  for (const venta of ventas) {
    if (venta.eventoId !== evento.id || yaContadaEnElPaquete(venta, evento)) continue;
    for (const item of venta.items) vendidasLocales.set(item.varianteId, (vendidasLocales.get(item.varianteId) ?? 0) + item.cantidad);
  }

  const productos = new Map<number, ProductoEnGrilla>();
  for (const v of variantes) {
    if (v.eventoId !== evento.id) continue;
    const locales = vendidasLocales.get(v.varianteId) ?? 0;
    const producto = productos.get(v.productoId) ?? {
      productoId: v.productoId,
      nombre: v.producto,
      marca: v.marca,
      categoria: v.categoria,
      precio: v.precio,
      imagen: v.imagen,
      stock: 0,
      vendidas: 0,
      variantes: [],
    };
    const stock = v.stock - locales;
    producto.stock += stock;
    producto.vendidas += v.vendidas + locales;
    producto.precio = Math.min(producto.precio, v.precio);
    producto.variantes.push({ varianteId: v.varianteId, talle: v.talle, color: v.color, sku: v.sku, precio: v.precio, stock });
    productos.set(v.productoId, producto);
  }
  return [...productos.values()].sort((a, b) => b.vendidas - a.vendidas || a.productoId - b.productoId);
}
