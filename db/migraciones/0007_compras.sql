ALTER TYPE "public"."tipo_movimiento" ADD VALUE 'compra';--> statement-breakpoint
CREATE TABLE "compra_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "compra_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"compra_id" integer NOT NULL,
	"variante_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"costo_unitario" numeric(12, 2) NOT NULL,
	CONSTRAINT "compra_items_compraId_varianteId_unique" UNIQUE("compra_id","variante_id"),
	CONSTRAINT "compra_items_cantidad_positiva" CHECK ("compra_items"."cantidad" > 0),
	CONSTRAINT "compra_items_costo_no_negativo" CHECK ("compra_items"."costo_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "compras" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "compras_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_uuid" uuid NOT NULL,
	"proveedor_id" integer NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"comprobante" text,
	"nota" text,
	"usuario_id" integer,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulada" boolean DEFAULT false NOT NULL,
	"anulada_at" timestamp with time zone,
	"anulada_por" integer,
	"motivo_anulacion" text,
	CONSTRAINT "compras_clientUuid_unique" UNIQUE("client_uuid")
);
--> statement-breakpoint
CREATE TABLE "proveedores" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "proveedores_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"cuit" text,
	"telefono" text,
	"email" text,
	"nota" text,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proveedores_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
ALTER TABLE "venta_items" ADD COLUMN "costo_unitario" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "compra_items" ADD CONSTRAINT "compra_items_compra_id_compras_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_items" ADD CONSTRAINT "compra_items_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compras" ADD CONSTRAINT "compras_anulada_por_usuarios_id_fk" FOREIGN KEY ("anulada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "compras_proveedor_id_index" ON "compras" USING btree ("proveedor_id");--> statement-breakpoint
CREATE INDEX "compras_fecha_index" ON "compras" USING btree ("fecha");--> statement-breakpoint
-- Igual que 0006: la API REST de Supabase no ve estas tablas. La app entra como postgres.
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;