# Estilofit — stock y venta en eventos

Panel web de trabajo (stock, eventos, ventas, movimientos, reportes, usuarios y auditoría) y una PWA para vender sin conexión desde el celular.

## Roles

| Rol | Puede |
| --- | --- |
| Administrador | Todo, incluidos usuarios, celulares, auditoría y reconstruir el stock. |
| Encargado | Stock, catálogo, transferencias, eventos, cierres y revisar ventas. |
| Consulta | Mira todo el panel y exporta. No cambia nada. |
| Vendedor | No entra al panel: vende desde el celular con su PIN de 4 números. |

Un administrador o encargado también puede tener PIN para vender. Cada cambio en el panel queda en Auditoría, que no se puede editar ni borrar.

## Correr en la máquina, sin Supabase

```bash
npm install
npm run db:local          # Postgres embebido en .base-local/, migrado y con la semilla
```

En otra terminal, con `.env.local` armado a partir de `.env.example` (para la base local, `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres?max=1`):

```bash
npm run build && npm run start
```

- Panel: http://localhost:3000/panel
- Celular: http://localhost:3000/celular

Usuarios de la semilla, todos con la clave `CLAVE_DEMO` y el PIN `PIN_DEMO` de `.env.local`:

| Usuario | Rol |
| --- | --- |
| martin@estilofit.com.ar | Administrador |
| lucia@estilofit.com.ar | Encargado |
| silvia@estilofit.com.ar | Consulta |
| Nicolás Pereyra, Agustina Sosa, Florencia Medina | Vendedores (solo PIN) |

El modo sin conexión solo funciona con build de producción: en `npm run dev` el service worker está apagado.

## Verificación

```bash
npm test            # arnés: Postgres real embebido (PGlite) + la cola del celular contra el endpoint real
npm run typecheck
npm run lint
```

## Pasar a Supabase y Vercel

1. En Supabase (plan pago), copiá las dos URLs a `.env.local`: `DATABASE_URL` (pooler, modo transaction, puerto 6543) y `DATABASE_URL_MIGRACIONES` (directa o modo session, puerto 5432).
2. `npm run db:migrar`.
3. Una de dos:
   - Datos de demo: `npm run db:semilla` sobre la base vacía. Después cambiá las claves y los PIN desde Usuarios.
   - Instalación limpia: entrá al panel sin correr la semilla y creá el primer administrador con `CLAVE_INSTALACION`.
4. En Vercel, cargá `DATABASE_URL`, `CLAVE_INSTALACION`, `SECRETO_SESION` y `TOPE_REDONDEO_EFECTIVO`, y deployá.

## Probar en el celular

1. Panel → Celulares → generar código. En el celular, abrir `/celular` con señal y escribir el código.
2. Agregar a la pantalla de inicio y abrirla una vez con señal, hasta que diga "La app abre sin señal".
3. Bajar el paquete del evento. Modo avión. Elegir quién vende y poner su PIN. Vender. Cerrar la app del todo y volver a abrirla. Sacar el modo avión y mirar el contador.
