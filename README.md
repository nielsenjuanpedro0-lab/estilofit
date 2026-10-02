# Estilofit — stock y venta en eventos (Fase 1)

Panel web para stock, eventos, cierre y reportes, y una PWA para vender sin conexión desde el celular.

## Correr en la máquina, sin Supabase

```bash
npm install
npm run db:local          # Postgres embebido en .base-local/, migrado y con la semilla
```

En otra terminal, con `.env.local` armado a partir de `.env.example` (para la base local, `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres?max=1`):

```bash
npm run build && npm run start
```

- Panel: http://localhost:3000/panel (clave: `CLAVE_PANEL` de `.env.local`)
- Celular: http://localhost:3000/celular

El modo sin conexión solo funciona con build de producción: en `npm run dev` el service worker está apagado.

## Verificación

```bash
npm test            # arnés: Postgres real embebido (PGlite) + la cola del celular contra el endpoint real
npm run typecheck
npm run lint
```

## Pasar a Supabase y Vercel

1. En Supabase (plan pago), copiá las dos URLs a `.env.local`: `DATABASE_URL` (pooler, modo transaction, puerto 6543) y `DATABASE_URL_MIGRACIONES` (directa o modo session, puerto 5432).
2. `npm run db:migrar` y, sobre la base vacía, `npm run db:semilla`.
3. En Vercel, cargá `DATABASE_URL`, `CLAVE_PANEL`, `SECRETO_SESION` y `TOPE_REDONDEO_EFECTIVO` como variables de entorno y deployá.

## Probar en el celular

1. Panel → Dispositivos → generar código. En el celular, abrir `/celular` con señal, escribir el código.
2. Agregar a la pantalla de inicio y abrirla una vez con señal, hasta que diga "La app abre sin señal".
3. Bajar el paquete del evento. Modo avión. Vender. Cerrar la app del todo y volver a abrirla. Sacar el modo avión y mirar el contador.
