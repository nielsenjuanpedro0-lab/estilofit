import Dexie, { type EntityTable, type Table } from "dexie";

// Lo que vive en el celular. No se cifra a propósito: la clave tendría que vivir en el mismo
// teléfono, así que no agregaría seguridad real. Si se pierde un celular, se revoca su token
// desde el panel y deja de poder subir ventas o bajar el catálogo.

export type Sesion = {
  id: 1;
  token: string;
  dispositivoId: number;
  dispositivoNombre: string;
  // El servidor respondió 401: hay que volver a darlo de alta. Las ventas pendientes no se tocan.
  revocado: boolean;
};

export type EventoBajado = {
  id: number;
  nombre: string;
  lugar: string;
  fechaDesde: string;
  fechaHasta: string;
  // Reloj del celular. Sirve para saber qué ventas confirmadas ya venían contadas en el paquete.
  descargadoEn: number;
  otrosDispositivos: number;
};

export type VarianteBajada = {
  eventoId: number;
  varianteId: number;
  productoId: number;
  producto: string;
  marca: string;
  categoria: string;
  sku: string;
  talle: string;
  color: string;
  precio: number;
  imagen: Blob | null;
  // Foto del servidor al bajar el paquete. El stock que se muestra resta las ventas locales posteriores.
  stock: number;
  vendidas: number;
};

export type RenglonDeVenta = { varianteId: number; cantidad: number; precio: number; descripcion: string };

export type VentaLocal = {
  clientUuid: string;
  eventoId: number;
  // Orden de la cola: FIFO por el momento en que se guardó.
  creadaEn: number;
  vendidoAt: string;
  medioPago: "efectivo" | "transferencia" | "tarjeta";
  // Quien estaba vendiendo (entró con su PIN). Nulo si el evento no tenía vendedores cargados.
  vendedorId: number | null;
  total: number;
  totalCatalogo: number;
  items: RenglonDeVenta[];
  estado: "pendiente" | "confirmada" | "rechazada";
  motivoRechazo: string | null;
  intentos: number;
  proximoIntentoEn: number;
  confirmadaEn: number | null;
};

export type Carrito = { eventoId: number; items: { varianteId: number; cantidad: number }[] };

// Quiénes pueden vender, con el hash de su PIN: llega con el paquete y se verifica sin señal.
export type Vendedor = { id: number; nombre: string; pinHash: string };

// Quién está vendiendo ahora en este celular. Uno a la vez; se cambia desde la pantalla de venta.
export type Turno = { id: 1; vendedorId: number; nombre: string; desde: number };

class Almacen extends Dexie {
  sesion!: EntityTable<Sesion, "id">;
  eventos!: EntityTable<EventoBajado, "id">;
  variantes!: Table<VarianteBajada, [number, number]>;
  ventas!: EntityTable<VentaLocal, "clientUuid">;
  carritos!: EntityTable<Carrito, "eventoId">;
  vendedores!: EntityTable<Vendedor, "id">;
  turno!: EntityTable<Turno, "id">;

  constructor() {
    super("estilofit");
    this.version(1).stores({
      sesion: "id",
      eventos: "id",
      variantes: "[eventoId+varianteId], eventoId",
      ventas: "clientUuid, estado, creadaEn, [eventoId+estado]",
      carritos: "eventoId",
    });
    // Versión 2: vendedores con PIN. Las ventas guardadas antes quedan sin vendedor.
    this.version(2)
      .stores({ vendedores: "id", turno: "id" })
      .upgrade((tx) =>
        tx
          .table("ventas")
          .toCollection()
          .modify((venta) => {
            venta.vendedorId ??= null;
          }),
      );
  }
}

export const almacen = new Almacen();
