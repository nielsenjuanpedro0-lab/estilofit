-- Supabase publica el esquema public en su API REST con la anon key, que es pública por diseño.
-- La app no usa esa API: entra como postgres, que es dueño de las tablas y no pasa por RLS.
-- Se prende RLS sin políticas y se sacan los permisos de anon y authenticated para que la API no lea ni escriba nada.
-- Los roles solo existen en Supabase: el arnés (PGlite) saltea esa parte.
ALTER TABLE ubicaciones ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE variantes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE dispositivos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE venta_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE movimientos ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE stock_actual ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE auditoria ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
DECLARE
  rol text;
BEGIN
  FOREACH rol IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', rol);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', rol);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', rol);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', rol);
    END IF;
  END LOOP;
END
$$;
