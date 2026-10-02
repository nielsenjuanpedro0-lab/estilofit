import { describe, expect, it } from "vitest";
import type { EventoBajado, VarianteBajada, VentaLocal } from "@/celular/almacen";
import { armarGrilla } from "@/celular/inventario";

const evento: EventoBajado = { id: 7, nombre: "Prueba", lugar: "Tandil", fechaDesde: "2026-10-17", fechaHasta: "2026-10-18", descargadoEn: 1000, otrosDispositivos: 0 };

function variante(varianteId: number, productoId: number, stock: number, vendidas = 0): VarianteBajada {
  return { eventoId: 7, varianteId, productoId, producto: `Producto ${productoId}`, marca: "M", categoria: "C", sku: `${varianteId}`, talle: "M", color: "Negro", precio: 1000, imagen: null, stock, vendidas };
}

function venta(varianteId: number, cantidad: number, estado: VentaLocal["estado"], confirmadaEn: number | null = null, eventoId = 7): VentaLocal {
  return {
    clientUuid: `${varianteId}-${cantidad}-${estado}-${confirmadaEn}`,
    eventoId,
    creadaEn: 0,
    vendidoAt: "2026-10-17T10:00:00-03:00",
    medioPago: "efectivo",
    total: 1000 * cantidad,
    totalCatalogo: 1000 * cantidad,
    items: [{ varianteId, cantidad, precio: 1000, descripcion: "" }],
    estado,
    motivoRechazo: null,
    intentos: 0,
    proximoIntentoEn: 0,
    confirmadaEn,
  };
}

describe("grilla del celular", () => {
  it("resta las ventas locales que el paquete todavía no contaba y no resta dos veces las que sí", () => {
    const grilla = armarGrilla(
      evento,
      [variante(1, 1, 10), variante(2, 1, 5)],
      [
        venta(1, 2, "pendiente"),
        venta(1, 1, "confirmada", 500), // confirmada antes de bajar el paquete: ya viene contada
        venta(1, 1, "confirmada", 2000), // confirmada después: se resta
        venta(2, 1, "rechazada"), // la mercadería salió igual
        venta(2, 3, "pendiente", null, 99), // de otro evento: no cuenta
      ],
    );
    const [producto] = grilla;
    expect(producto?.variantes.map((v) => v.stock)).toEqual([7, 4]);
    expect(producto?.stock).toBe(11);
  });

  it("ordena por más vendido en el evento y se reordena con las ventas locales", () => {
    const variantes = [variante(1, 1, 10, 3), variante(2, 2, 10, 1)];
    expect(armarGrilla(evento, variantes, []).map((p) => p.productoId)).toEqual([1, 2]);
    const despues = armarGrilla(evento, variantes, [venta(2, 3, "pendiente")]);
    expect(despues.map((p) => p.productoId)).toEqual([2, 1]);
  });
});
