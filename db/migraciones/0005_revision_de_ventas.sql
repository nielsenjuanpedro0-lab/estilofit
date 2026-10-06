ALTER TABLE "ventas" ADD COLUMN "revisada_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "revisada_por" integer;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "nota_de_revision" text;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_revisada_por_usuarios_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;