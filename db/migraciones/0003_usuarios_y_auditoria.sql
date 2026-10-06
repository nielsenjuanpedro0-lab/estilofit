CREATE TYPE "public"."rol_usuario" AS ENUM('administrador', 'encargado', 'vendedor', 'consulta');--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "auditoria_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"usuario_id" integer,
	"accion" text NOT NULL,
	"detalle" text NOT NULL,
	"ocurrido_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "usuarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nombre" text NOT NULL,
	"email" text,
	"rol" "rol_usuario" NOT NULL,
	"clave_hash" text,
	"pin_hash" text,
	"activo" boolean DEFAULT true NOT NULL,
	"version_sesion" integer DEFAULT 1 NOT NULL,
	"creado_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_ingreso_at" timestamp with time zone,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "usuario_id" integer;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_ocurrido_at_index" ON "auditoria" USING btree ("ocurrido_at");--> statement-breakpoint
CREATE INDEX "auditoria_usuario_id_index" ON "auditoria" USING btree ("usuario_id");--> statement-breakpoint
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;