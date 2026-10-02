CREATE TYPE "public"."estado_evento" AS ENUM('preparacion', 'abierto', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."medio_pago" AS ENUM('efectivo', 'transferencia', 'tarjeta');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('carga_inicial', 'transferencia', 'venta', 'devolucion', 'ajuste', 'merma');--> statement-breakpoint
CREATE TYPE "public"."tipo_ubicacion" AS ENUM('deposito', 'showroom', 'evento', 'web');--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dispositivos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"codigo_alta_hash" text,
	"codigo_alta_vence_at" timestamp with time zone,
	"token_hash" text,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"enrolado_at" timestamp with time zone,
	"revocado_at" timestamp with time zone,
	"ultimo_contacto_at" timestamp with time zone,
	CONSTRAINT "dispositivos_codigoAltaHash_unique" UNIQUE("codigo_alta_hash"),
	CONSTRAINT "dispositivos_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "eventos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"lugar" text NOT NULL,
	"fecha_desde" date NOT NULL,
	"fecha_hasta" date NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"estado" "estado_evento" DEFAULT 'preparacion' NOT NULL,
	"cerrado_at" timestamp with time zone,
	CONSTRAINT "eventos_ubicacionId_unique" UNIQUE("ubicacion_id"),
	CONSTRAINT "eventos_fechas_ordenadas" CHECK ("eventos"."fecha_hasta" >= "eventos"."fecha_desde")
);
--> statement-breakpoint
CREATE TABLE "movimientos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "movimientos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"variante_id" integer NOT NULL,
	"ubicacion_origen_id" integer,
	"ubicacion_destino_id" integer,
	"cantidad" integer NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"ref_id" bigint,
	"client_uuid" uuid,
	"device_id" integer,
	"ocurrido_at" timestamp with time zone NOT NULL,
	"recibido_at" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" integer,
	"nota" text,
	CONSTRAINT "movimientos_clientUuid_unique" UNIQUE("client_uuid"),
	CONSTRAINT "movimientos_cantidad_positiva" CHECK ("movimientos"."cantidad" > 0),
	CONSTRAINT "movimientos_con_origen_o_destino" CHECK ("movimientos"."ubicacion_origen_id" is not null or "movimientos"."ubicacion_destino_id" is not null),
	CONSTRAINT "movimientos_origen_distinto_de_destino" CHECK ("movimientos"."ubicacion_origen_id" is distinct from "movimientos"."ubicacion_destino_id")
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "productos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"marca" text NOT NULL,
	"categoria" text NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_actual" (
	"variante_id" integer NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	CONSTRAINT "stock_actual_variante_id_ubicacion_id_pk" PRIMARY KEY("variante_id","ubicacion_id")
);
--> statement-breakpoint
CREATE TABLE "ubicaciones" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ubicaciones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"tipo" "tipo_ubicacion" NOT NULL,
	"activa" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ubicaciones_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "variantes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "variantes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"producto_id" integer NOT NULL,
	"sku" text NOT NULL,
	"talle" text NOT NULL,
	"color" text NOT NULL,
	"precio" numeric(12, 2) NOT NULL,
	"costo" numeric(12, 2),
	"imagen_url" text,
	"tiendanube_variant_id" bigint,
	"activo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "variantes_sku_unique" UNIQUE("sku"),
	CONSTRAINT "variantes_productoId_talle_color_unique" UNIQUE("producto_id","talle","color"),
	CONSTRAINT "variantes_precio_no_negativo" CHECK ("variantes"."precio" >= 0)
);
--> statement-breakpoint
CREATE TABLE "venta_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "venta_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"venta_id" bigint NOT NULL,
	"variante_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario" numeric(12, 2) NOT NULL,
	CONSTRAINT "venta_items_cantidad_positiva" CHECK ("venta_items"."cantidad" > 0)
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ventas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"client_uuid" uuid NOT NULL,
	"evento_id" integer,
	"ubicacion_id" integer NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"total_catalogo" numeric(12, 2) NOT NULL,
	"medio_pago" "medio_pago" NOT NULL,
	"device_id" integer NOT NULL,
	"vendido_at" timestamp with time zone NOT NULL,
	"recibido_at" timestamp with time zone DEFAULT now() NOT NULL,
	"anulada" boolean DEFAULT false NOT NULL,
	"para_revisar" boolean DEFAULT false NOT NULL,
	"motivo_revision" text,
	CONSTRAINT "ventas_clientUuid_unique" UNIQUE("client_uuid")
);
--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_ubicacion_origen_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_origen_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_ubicacion_destino_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_destino_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_device_id_dispositivos_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_actual" ADD CONSTRAINT "stock_actual_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_actual" ADD CONSTRAINT "stock_actual_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variantes" ADD CONSTRAINT "variantes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_variante_id_variantes_id_fk" FOREIGN KEY ("variante_id") REFERENCES "public"."variantes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_ubicacion_id_ubicaciones_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."ubicaciones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_device_id_dispositivos_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_variante_id_index" ON "movimientos" USING btree ("variante_id");--> statement-breakpoint
CREATE INDEX "movimientos_ubicacion_origen_id_index" ON "movimientos" USING btree ("ubicacion_origen_id");--> statement-breakpoint
CREATE INDEX "movimientos_ubicacion_destino_id_index" ON "movimientos" USING btree ("ubicacion_destino_id");--> statement-breakpoint
CREATE INDEX "movimientos_tipo_ref_id_index" ON "movimientos" USING btree ("tipo","ref_id");--> statement-breakpoint
CREATE INDEX "venta_items_venta_id_index" ON "venta_items" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "ventas_evento_id_index" ON "ventas" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "ventas_recibido_at_index" ON "ventas" USING btree ("recibido_at");