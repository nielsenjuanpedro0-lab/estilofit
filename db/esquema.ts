import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Los triggers, las funciones de stock y la vista del libro mayor no se pueden
// expresar en Drizzle: viven en la migración SQL escrita a mano (0001).

export const tipoUbicacion = pgEnum("tipo_ubicacion", ["deposito", "showroom", "evento", "web"]);
export const estadoEvento = pgEnum("estado_evento", ["preparacion", "abierto", "cerrado"]);
export const tipoMovimiento = pgEnum("tipo_movimiento", [
  "carga_inicial",
  "transferencia",
  "venta",
  "devolucion",
  "ajuste",
  "merma",
]);
export const medioPago = pgEnum("medio_pago", ["efectivo", "transferencia", "tarjeta"]);

const ahora = () => timestamp({ withTimezone: true }).notNull().defaultNow();
// mode "number": la plata se maneja como number en TS pero se guarda exacta en numeric.
const plata = () => numeric({ precision: 12, scale: 2, mode: "number" });

export const productos = pgTable("productos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull(),
  marca: text().notNull(),
  categoria: text().notNull(),
  activo: boolean().notNull().default(true),
  creadoAt: ahora(),
});

export const variantes = pgTable(
  "variantes",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    productoId: integer()
      .notNull()
      .references(() => productos.id),
    sku: text().notNull().unique(),
    talle: text().notNull(),
    color: text().notNull(),
    precio: plata().notNull(),
    // Enganches de fases 2 y 3: quedan en el schema sin uso.
    costo: plata(),
    imagenUrl: text(),
    tiendanubeVariantId: bigint({ mode: "number" }),
    activo: boolean().notNull().default(true),
  },
  (t) => [
    unique().on(t.productoId, t.talle, t.color),
    check("variantes_precio_no_negativo", sql`${t.precio} >= 0`),
  ],
);

export const ubicaciones = pgTable("ubicaciones", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull().unique(),
  tipo: tipoUbicacion().notNull(),
  activa: boolean().notNull().default(true),
});

export const eventos = pgTable(
  "eventos",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    nombre: text().notNull(),
    lugar: text().notNull(),
    fechaDesde: date({ mode: "string" }).notNull(),
    fechaHasta: date({ mode: "string" }).notNull(),
    // Cada evento tiene su propia ubicación: un segundo equipo de venta es otro evento.
    ubicacionId: integer()
      .notNull()
      .unique()
      .references(() => ubicaciones.id),
    estado: estadoEvento().notNull().default("preparacion"),
    cerradoAt: timestamp({ withTimezone: true }),
  },
  (t) => [check("eventos_fechas_ordenadas", sql`${t.fechaHasta} >= ${t.fechaDesde}`)],
);

export const dispositivos = pgTable("dispositivos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  nombre: text().notNull(),
  // Solo hashes: ni el código de alta ni el token se guardan en claro.
  codigoAltaHash: text().unique(),
  codigoAltaVenceAt: timestamp({ withTimezone: true }),
  tokenHash: text().unique(),
  creadoAt: ahora(),
  enroladoAt: timestamp({ withTimezone: true }),
  revocadoAt: timestamp({ withTimezone: true }),
  ultimoContactoAt: timestamp({ withTimezone: true }),
});

export const movimientos = pgTable(
  "movimientos",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    varianteId: integer()
      .notNull()
      .references(() => variantes.id),
    ubicacionOrigenId: integer().references(() => ubicaciones.id),
    ubicacionDestinoId: integer().references(() => ubicaciones.id),
    cantidad: integer().notNull(),
    tipo: tipoMovimiento().notNull(),
    refId: bigint({ mode: "number" }),
    clientUuid: uuid().unique(),
    deviceId: integer().references(() => dispositivos.id),
    ocurridoAt: timestamp({ withTimezone: true }).notNull(),
    recibidoAt: ahora(),
    usuarioId: integer(),
    nota: text(),
  },
  (t) => [
    check("movimientos_cantidad_positiva", sql`${t.cantidad} > 0`),
    check(
      "movimientos_con_origen_o_destino",
      sql`${t.ubicacionOrigenId} is not null or ${t.ubicacionDestinoId} is not null`,
    ),
    check("movimientos_origen_distinto_de_destino", sql`${t.ubicacionOrigenId} is distinct from ${t.ubicacionDestinoId}`),
    index().on(t.varianteId),
    index().on(t.ubicacionOrigenId),
    index().on(t.ubicacionDestinoId),
    index().on(t.tipo, t.refId),
  ],
);

export const ventas = pgTable(
  "ventas",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    // La clave de la idempotencia: la genera el dispositivo antes de guardar la venta.
    clientUuid: uuid().notNull().unique(),
    eventoId: integer().references(() => eventos.id),
    ubicacionId: integer()
      .notNull()
      .references(() => ubicaciones.id),
    // Lo que el dispositivo dice que cobró. totalCatalogo es lo que recalcula el servidor.
    total: plata().notNull(),
    totalCatalogo: plata().notNull(),
    medioPago: medioPago().notNull(),
    deviceId: integer()
      .notNull()
      .references(() => dispositivos.id),
    vendidoAt: timestamp({ withTimezone: true }).notNull(),
    recibidoAt: ahora(),
    anulada: boolean().notNull().default(false),
    paraRevisar: boolean().notNull().default(false),
    motivoRevision: text(),
  },
  (t) => [index().on(t.eventoId), index().on(t.recibidoAt)],
);

export const ventaItems = pgTable(
  "venta_items",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    ventaId: bigint({ mode: "number" })
      .notNull()
      .references(() => ventas.id),
    varianteId: integer()
      .notNull()
      .references(() => variantes.id),
    cantidad: integer().notNull(),
    precioUnitario: plata().notNull(),
  },
  (t) => [check("venta_items_cantidad_positiva", sql`${t.cantidad} > 0`), index().on(t.ventaId)],
);

// Materializada por trigger. La fuente de verdad es siempre movimientos.
export const stockActual = pgTable(
  "stock_actual",
  {
    varianteId: integer()
      .notNull()
      .references(() => variantes.id),
    ubicacionId: integer()
      .notNull()
      .references(() => ubicaciones.id),
    cantidad: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.varianteId, t.ubicacionId] })],
);
