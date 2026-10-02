// Límite simple por dispositivo, en memoria del proceso: alcanza para un cliente.
// Ventana fija de un minuto. Un dispositivo que vuelve a tener señal con 200 ventas sube
// unos pocos lotes; 60 pedidos por minuto solo los pasa algo roto o malicioso.

const PEDIDOS_POR_MINUTO = 60;
const ventanas = new Map<number, { inicio: number; pedidos: number }>();

export function dentroDelLimite(dispositivoId: number, ahora = Date.now()) {
  const ventana = ventanas.get(dispositivoId);
  if (!ventana || ahora - ventana.inicio >= 60_000) {
    ventanas.set(dispositivoId, { inicio: ahora, pedidos: 1 });
    return true;
  }
  ventana.pedidos += 1;
  return ventana.pedidos <= PEDIDOS_POR_MINUTO;
}
