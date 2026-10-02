import { z } from "zod";

// Lo que cruza la frontera entre el dispositivo y el servidor al subir ventas.
// Se valida siempre, incluso si lo mandó nuestra app: la venta pudo quedar guardada
// hace tres días con una versión vieja.

export const MAXIMO_VENTAS_POR_LOTE = 50;

export const VentaDelDispositivo = z.object({
  clientUuid: z.uuid(),
  eventoId: z.number().int().positive(),
  // Reloj del dispositivo: se guarda pero no se usa para ordenar.
  vendidoAt: z.iso.datetime({ offset: true }),
  medioPago: z.enum(["efectivo", "transferencia", "tarjeta"]),
  total: z.number().nonnegative().max(99_999_999),
  items: z
    .array(
      z.object({
        varianteId: z.number().int().positive(),
        cantidad: z.number().int().positive().max(999),
      }),
    )
    .min(1)
    .max(100),
});
export type VentaDelDispositivo = z.infer<typeof VentaDelDispositivo>;

export const LoteDeVentas = z.object({
  // Cada venta se valida por separado: una rota no tumba al resto del lote.
  ventas: z.array(z.unknown()).min(1).max(MAXIMO_VENTAS_POR_LOTE),
});

export const RespuestaSincronizacion = z.object({
  // Recién con el client_uuid en esta lista el dispositivo puede marcar la venta como subida.
  confirmadas: z.array(z.string()),
  rechazadas: z.array(z.object({ clientUuid: z.string(), motivo: z.string() })),
});
export type RespuestaSincronizacion = z.infer<typeof RespuestaSincronizacion>;
