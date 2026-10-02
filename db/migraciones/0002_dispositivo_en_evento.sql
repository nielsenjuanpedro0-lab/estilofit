ALTER TABLE "dispositivos" ADD COLUMN "evento_id" integer;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD COLUMN "pendientes_informadas" integer;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD COLUMN "pendientes_informadas_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;