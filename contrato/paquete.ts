import { z } from "zod";

// Lo que el celular baja antes de salir al evento. El celular también lo valida: si el servidor
// y la app quedaron en versiones distintas, mejor un error claro en el depósito que en la carrera.

const EventoParaCelular = z.object({
  id: z.number().int(),
  nombre: z.string(),
  lugar: z.string(),
  fechaDesde: z.string(),
  fechaHasta: z.string(),
  estado: z.enum(["preparacion", "abierto", "cerrado"]),
});
export type EventoParaCelular = z.infer<typeof EventoParaCelular>;

export const ListaDeEventos = z.object({ eventos: z.array(EventoParaCelular) });

export const Paquete = z.object({
  evento: EventoParaCelular,
  variantes: z.array(
    z.object({
      varianteId: z.number().int(),
      productoId: z.number().int(),
      producto: z.string(),
      marca: z.string(),
      categoria: z.string(),
      sku: z.string(),
      talle: z.string(),
      color: z.string(),
      precio: z.number(),
      imagenUrl: z.string().nullable(),
      // Stock del evento según el servidor al armar el paquete. Puede ser negativo.
      stock: z.number().int(),
      // Unidades ya vendidas en este evento: el orden inicial de la grilla.
      vendidas: z.number().int(),
    }),
  ),
  // Otros celulares que bajaron este evento. Si hay alguno, el stock de la pantalla es estimado.
  otrosDispositivos: z.number().int(),
  // Quiénes pueden vender y el hash de su PIN, para verificarlo sin señal.
  vendedores: z.array(z.object({ id: z.number().int(), nombre: z.string(), pinHash: z.string() })),
});
export type Paquete = z.infer<typeof Paquete>;
