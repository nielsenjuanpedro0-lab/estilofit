# Compras: proveedores, ingreso de mercadería y costos

Fecha: 2026-10-07. Primera de tres piezas (después vienen Cambios y devoluciones, y Caja del evento).

## Objetivo

Que la mercadería nueva entre al negocio con proveedor, comprobante y costo, y que los reportes muestren el margen sin reescribir el pasado. Hoy el stock solo entra por `carga_inicial`, sin proveedor ni costo.

## Decisiones

- **Costo:** el de la última compra. Cada compra pisa `variantes.costo` con el costo del renglón.
- **Sin cuenta corriente:** no hay pagos, saldos ni vencimientos. Se puede agregar después sin tocar este diseño.
- **Variantes:** solo se compran variantes que ya existen en Catálogo. Si falta una, se da de alta en Catálogo primero.
- **Destino:** depósito o showroom, elegido en cada compra. Nunca un evento: para eso están las transferencias.
- **Modelo:** compra con cabecera y renglones, más movimientos en el libro mayor (no se guarda proveedor ni costo en `movimientos`).

## Datos

Migración nueva (`0007_compras`):

- `proveedores`: `id`, `nombre` (único, no nulo), `cuit`, `telefono`, `email`, `nota` (todos texto opcional), `activo` (por defecto true), `creado_at`.
- `compras`: `id`, `client_uuid` (único, no nulo), `proveedor_id` → proveedores, `ubicacion_id` → ubicaciones, `fecha` (date), `comprobante` (texto opcional), `nota`, `usuario_id` → usuarios, `creado_at`, `anulada` (por defecto false), `anulada_at`, `anulada_por` → usuarios, `motivo_anulacion`.
- `compra_items`: `id`, `compra_id` → compras, `variante_id` → variantes, `cantidad` (`CHECK > 0`), `costo_unitario` (numeric 12,2, `CHECK >= 0`); único `(compra_id, variante_id)`.
- `tipo_movimiento` suma el valor `compra`. Cada renglón genera un movimiento `compra` sin origen, con destino en la ubicación de la compra y `ref_id` = id de la compra.
- `venta_items` suma `costo_unitario` (numeric 12,2, nulo). Lo completa el servidor al sincronizar la venta con el `variantes.costo` vigente en ese momento. Las ventas anteriores quedan con nulo.
- RLS activado en las tres tablas nuevas, sin políticas, igual que la migración 0006.

## Reglas

- **Alta de compra:** cabecera, renglones, movimientos y actualización de `variantes.costo` van en una sola transacción.
- **Idempotencia:** el formulario genera un `client_uuid` al abrirse. Si la misma compra llega dos veces, la segunda devuelve la ya creada sin duplicar nada.
- **Validación:**
  - El proveedor está activo y el destino es un depósito o showroom activo.
  - Hay al menos un renglón, sin variantes repetidas (mensaje: "sumá la cantidad en un solo renglón").
  - Cada renglón tiene cantidad entera de 1 a 9999, costo de 0 o más, y una variante activa.
  - La fecha no es futura.
- **Anulación:**
  - Pide nota obligatoria y no se puede anular dos veces.
  - Bloquea con `FOR UPDATE` el stock del destino. Si falta stock para algún renglón (porque ya se transfirió o se vendió), se rechaza entera y devuelve los faltantes.
  - Si alcanza, genera un movimiento `compra` de salida (con origen en el destino y sin destino) por cada renglón, con `ref_id` = id de la compra. No se usa `ajuste`, porque el cierre de eventos ya usa `ajuste` con `ref_id` = id del evento y los dos se mezclarían.
  - No restaura el costo anterior de la variante: lo corrige el próximo ingreso, y la pantalla lo avisa.
- **Proveedor:** no se borra, se desactiva. Nombre duplicado rechazado.
- **Ingreso suelto de Catálogo:** queda como está (`carga_inicial`, sin proveedor), para correcciones rápidas.

## Permisos

Compras y Proveedores se ven con `ver`. Cargar compras, anularlas y dar de alta o editar proveedores pide `operar`.

## Pantallas

En la barra lateral, grupo Stock: **Compras** y **Proveedores**.

- **`/panel/compras`:** lista con fecha, proveedor, comprobante, destino, unidades, total a costo y estado (anulada en gris). Filtros por proveedor y fechas, paginación y exportar.
- **`/panel/compras/nueva`:**
  1. Cabecera: proveedor (solo activos), destino, fecha (hoy por defecto) y comprobante.
  2. Renglones: buscador por SKU o nombre que agrega filas con producto, talle, color, cantidad y costo. El costo arranca con el último conocido. Si el costo nuevo difiere más de 20% del anterior, aparece el aviso "antes $X", que no bloquea.
  3. Link "Dar de alta en Catálogo" que se abre en otra pestaña.
  4. Pie: total de unidades, total a costo y botón "Guardar compra".
- **`/panel/compras/[id]`:** cabecera, renglones, movimientos generados y quién la cargó. Botón "Anular" con nota obligatoria. Si no se puede anular, explica qué falta.
- **`/panel/proveedores`:** lista con nombre, CUIT, contacto, cantidad de compras, fecha de la última y activo. Formulario de alta arriba.
- **`/panel/proveedores/[id]`:** edición de los datos, sus compras y lo que más se le compró (productos y unidades).
- **Reportes:** el ranking de productos suma Costo, Margen $ y Margen %, con un total de margen del período arriba. Las unidades sin costo se informan aparte ("N unidades sin costo") y no entran al margen.
- **Catálogo:** cada variante muestra su costo vigente y el margen % al lado del precio.
- **Buscador global y auditoría:** el buscador encuentra proveedores y compras por comprobante. En auditoría quedan el alta y la edición de proveedores, y el alta y la anulación de compras.

## Fuera de alcance

Editar una compra guardada (se anula y se carga de nuevo), adjuntar el PDF del comprobante, pagos y saldos con proveedores, y alta de variantes desde la compra.

## Verificación

- `verificacion/compras.test.ts`:
  - El alta crea cabecera, renglones y movimientos, sube el stock y actualiza el costo.
  - Rechaza variantes repetidas, proveedores inactivos y destinos de tipo evento.
  - El mismo `client_uuid` dos veces deja una sola compra.
  - La anulación genera los movimientos de salida y `verificarStock()` queda limpio.
  - Si el stock ya se transfirió, la anulación se rechaza con los faltantes; una compra anulada no se anula de nuevo.
- `sincronizacion.test.ts`: la venta copia el costo vigente, y un cambio de costo posterior no la altera.
- `reportes.test.ts`: el margen sale bien y las unidades sin costo quedan aparte.
- `acciones-panel.test.ts`: Consulta no puede cargar ni anular compras.
- `semilla.test.ts`: la semilla suma 2 proveedores y 3 compras, y sigue cuadrando.
- typecheck, lint, build, y una prueba en el navegador cargando y anulando una compra contra la base local.
