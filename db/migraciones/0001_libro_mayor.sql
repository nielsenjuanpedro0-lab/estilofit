-- El stock es un libro mayor: movimientos es la única fuente de verdad.
-- stock_actual es una copia materializada para leer rápido, mantenida por trigger
-- y reconstruible desde cero en cualquier momento.

-- La suma del libro mayor por variante y ubicación. La usan recalcular, verificar y el arnés,
-- así la regla de cómo se suma está escrita una sola vez.
CREATE VIEW stock_segun_movimientos AS
SELECT m.variante_id, m.ubicacion_id, sum(m.delta)::integer AS cantidad
FROM (
  SELECT movimientos.variante_id, movimientos.ubicacion_destino_id AS ubicacion_id, movimientos.cantidad AS delta
  FROM movimientos
  WHERE movimientos.ubicacion_destino_id IS NOT NULL
  UNION ALL
  SELECT movimientos.variante_id, movimientos.ubicacion_origen_id AS ubicacion_id, -movimientos.cantidad AS delta
  FROM movimientos
  WHERE movimientos.ubicacion_origen_id IS NOT NULL
) m
GROUP BY m.variante_id, m.ubicacion_id;
--> statement-breakpoint

-- Un error se corrige con un movimiento de ajuste, nunca editando el original.
-- TRUNCATE no dispara este trigger: es la única forma de vaciar el libro, y es solo para desarrollo.
CREATE FUNCTION movimientos_inmutables() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Los movimientos no se modifican ni se borran: registrá un movimiento de ajuste'
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimientos_inmutables
BEFORE UPDATE OR DELETE ON movimientos
FOR EACH ROW EXECUTE FUNCTION movimientos_inmutables();
--> statement-breakpoint

-- Cada movimiento resta en el origen y suma en el destino. ON CONFLICT toma el lock de la fila,
-- así dos dispositivos sincronizando a la vez no pisan el número.
CREATE FUNCTION aplicar_movimiento_a_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.ubicacion_origen_id IS NOT NULL THEN
    INSERT INTO stock_actual (variante_id, ubicacion_id, cantidad)
    VALUES (NEW.variante_id, NEW.ubicacion_origen_id, -NEW.cantidad)
    ON CONFLICT (variante_id, ubicacion_id)
    DO UPDATE SET cantidad = stock_actual.cantidad + EXCLUDED.cantidad;
  END IF;
  IF NEW.ubicacion_destino_id IS NOT NULL THEN
    INSERT INTO stock_actual (variante_id, ubicacion_id, cantidad)
    VALUES (NEW.variante_id, NEW.ubicacion_destino_id, NEW.cantidad)
    ON CONFLICT (variante_id, ubicacion_id)
    DO UPDATE SET cantidad = stock_actual.cantidad + EXCLUDED.cantidad;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimientos_a_stock_actual
AFTER INSERT ON movimientos
FOR EACH ROW EXECUTE FUNCTION aplicar_movimiento_a_stock();
--> statement-breakpoint

-- Borra la materializada y la reconstruye sumando el libro mayor. Devuelve cuántas filas escribió.
-- El lock sobre movimientos frena inserts concurrentes mientras se reconstruye.
CREATE FUNCTION recalcular_stock_actual() RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  filas integer;
BEGIN
  LOCK TABLE movimientos IN SHARE MODE;
  DELETE FROM stock_actual;
  INSERT INTO stock_actual (variante_id, ubicacion_id, cantidad)
  SELECT s.variante_id, s.ubicacion_id, s.cantidad FROM stock_segun_movimientos s;
  GET DIAGNOSTICS filas = ROW_COUNT;
  RETURN filas;
END;
$$;
--> statement-breakpoint

-- Devuelve las filas donde la materializada y el libro mayor no coinciden. Vacío = cuadra.
CREATE FUNCTION verificar_stock_actual()
RETURNS TABLE (variante_id integer, ubicacion_id integer, materializado integer, segun_movimientos integer)
LANGUAGE sql STABLE AS $$
  SELECT
    coalesce(sa.variante_id, sm.variante_id),
    coalesce(sa.ubicacion_id, sm.ubicacion_id),
    sa.cantidad,
    sm.cantidad
  FROM stock_actual sa
  FULL OUTER JOIN stock_segun_movimientos sm
    ON sm.variante_id = sa.variante_id AND sm.ubicacion_id = sa.ubicacion_id
  WHERE sa.cantidad IS DISTINCT FROM sm.cantidad;
$$;
