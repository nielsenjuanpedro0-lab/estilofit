import { almacen, type RenglonDeVenta, type VentaLocal } from "@/celular/almacen";
import { sincronizar } from "@/celular/cola";

// Guardar una venta no toca la red: se escribe en el celular y la cola la sube cuando pueda.
export async function guardarVenta(datos: {
  eventoId: number;
  items: RenglonDeVenta[];
  medioPago: VentaLocal["medioPago"];
  total: number;
}): Promise<VentaLocal> {
  const venta: VentaLocal = {
    // El UUID nace acá, antes de guardar: es la clave que hace idempotente la subida.
    clientUuid: crypto.randomUUID(),
    eventoId: datos.eventoId,
    creadaEn: Date.now(),
    vendidoAt: new Date().toISOString(),
    medioPago: datos.medioPago,
    total: datos.total,
    totalCatalogo: datos.items.reduce((suma, i) => suma + i.precio * i.cantidad, 0),
    items: datos.items,
    estado: "pendiente",
    motivoRechazo: null,
    intentos: 0,
    proximoIntentoEn: 0,
    confirmadaEn: null,
  };
  await almacen.transaction("rw", almacen.ventas, almacen.carritos, async () => {
    await almacen.ventas.add(venta);
    await almacen.carritos.delete(datos.eventoId);
  });
  void sincronizar();
  return venta;
}
