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
  // Quien vendía (entró con su PIN). Opcional: las ventas guardadas por versiones viejas de la app no lo traen.
  vendedorId: z.number().int().positive().nullable().optional(),
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
  ventas: z.array(z.unknown()).max(MAXIMO_VENTAS_POR_LOTE),
  // Ventas que el celular tiene sin subir además de las de este lote. El cierre lo usa para avisar.
  pendientesFueraDelLote: z.number().int().nonnegative(),
  // El evento que el celular tiene abierto, para responderle cuántos más venden en él.
  eventoId: z.number().int().positive().nullable(),
});
export type LoteDeVentas = z.infer<typeof LoteDeVentas>;

export const RespuestaSincronizacion = z.object({
  // Recién con el client_uuid en esta lista el dispositivo puede marcar la venta como subida.
  confirmadas: z.array(z.string()),
  rechazadas: z.array(z.object({ clientUuid: z.string(), motivo: z.string() })),
  otrosDispositivos: z.number().int().nullable(),
});
export type RespuestaSincronizacion = z.infer<typeof RespuestaSincronizacion>;
