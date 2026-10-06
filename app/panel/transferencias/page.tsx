import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { transferirAccion } from "@/app/panel/acciones";
import { ElegirStock } from "@/app/panel/elegir-stock";
import { db } from "@/db/conexion";
import { eventos, movimientos, productos, ubicaciones, variantes } from "@/db/esquema";
import { momento, TIPO_UBICACION } from "@/componentes/formato";
import { Aviso, Boton, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Selector, Tarjeta, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { stockConNombres } from "@/servidor/transferencias";

const origen = alias(ubicaciones, "origen");
const destino = alias(ubicaciones, "destino");

export default async function Transferencias({ searchParams }: { searchParams: Promise<{ origen?: string; destino?: string }> }) {
  await paginaConPermiso("operar");
  const pedido = await searchParams;

  // Todas las ubicaciones activas menos los eventos cerrados, que ya devolvieron su stock.
  const lista = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre, tipo: ubicaciones.tipo })
    .from(ubicaciones)
    .leftJoin(eventos, eq(eventos.ubicacionId, ubicaciones.id))
    .where(and(eq(ubicaciones.activa, true), or(isNull(eventos.id), ne(eventos.estado, "cerrado"))))
    .orderBy(asc(ubicaciones.id));
  const elegidoOrigen = lista.find((u) => u.id === Number(pedido.origen));
  const elegidoDestino = lista.find((u) => u.id === Number(pedido.destino));
  const listos = elegidoOrigen && elegidoDestino && elegidoOrigen.id !== elegidoDestino.id;

  const disponibles = listos
    ? (await stockConNombres(elegidoOrigen.id)).filter((s) => s.cantidad > 0).map(({ cantidad, ...resto }) => ({ ...resto, disponible: cantidad }))
    : [];

  const ultimas = await db()
    .select({
      id: movimientos.id,
      ocurridoAt: movimientos.ocurridoAt,
      cantidad: movimientos.cantidad,
      nota: movimientos.nota,
      producto: productos.nombre,
      talle: variantes.talle,
      color: variantes.color,
      origen: origen.nombre,
      destino: destino.nombre,
    })
    .from(movimientos)
    .innerJoin(variantes, eq(variantes.id, movimientos.varianteId))
    .innerJoin(productos, eq(productos.id, variantes.productoId))
    .innerJoin(origen, eq(origen.id, movimientos.ubicacionOrigenId))
    .innerJoin(destino, eq(destino.id, movimientos.ubicacionDestinoId))
    .where(eq(movimientos.tipo, "transferencia"))
    .orderBy(desc(movimientos.recibidoAt), desc(movimientos.id))
    .limit(40);

  const etiqueta = (u: (typeof lista)[number]) => `${u.nombre} (${TIPO_UBICACION[u.tipo]})`;

  return (
    <>
      <EncabezadoDePagina
        titulo="Transferencias"
        descripcion="Mover mercadería entre depósito, showroom y eventos: reponer el showroom, mandar refuerzos a un evento o pasar stock de un equipo a otro. Si al origen le falta algo, no se mueve nada y te dice qué bajar."
        acciones={<EnlaceBoton href="/panel/movimientos?tipo=transferencia">Ver todas en Movimientos</EnlaceBoton>}
      />

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-end">
        <Selector etiqueta="Sale de" name="origen" defaultValue={elegidoOrigen?.id ?? ""} required>
          <option value="" disabled>
            Elegí el origen
          </option>
          {lista.map((u) => (
            <option key={u.id} value={u.id}>
              {etiqueta(u)}
            </option>
          ))}
        </Selector>
        <span aria-hidden className="hidden pb-3 text-2xl font-black md:block">
          →
        </span>
        <Selector etiqueta="Va a" name="destino" defaultValue={elegidoDestino?.id ?? ""} required>
          <option value="" disabled>
            Elegí el destino
          </option>
          {lista.map((u) => (
            <option key={u.id} value={u.id}>
              {etiqueta(u)}
            </option>
          ))}
        </Selector>
        <Boton type="submit">Elegir mercadería</Boton>
      </form>

      {elegidoOrigen && elegidoDestino && elegidoOrigen.id === elegidoDestino.id && (
        <Aviso tono="error">El origen y el destino son la misma ubicación. Elegí otro destino.</Aviso>
      )}
      {listos &&
        (disponibles.length === 0 ? (
          <Vacio titulo={`No hay stock en ${elegidoOrigen.nombre}`}>Elegí otro origen o ingresá mercadería desde Catálogo.</Vacio>
        ) : (
          <Tarjeta titulo={`De ${elegidoOrigen.nombre} a ${elegidoDestino.nombre}`}>
            <ElegirStock
              key={`${elegidoOrigen.id}-${elegidoDestino.id}`}
              disponibles={disponibles}
              mover={transferirAccion.bind(null, elegidoOrigen.id, elegidoDestino.id)}
              destino={elegidoDestino.nombre}
            />
          </Tarjeta>
        ))}

      <Tarjeta titulo="Últimas transferencias">
        {ultimas.length === 0 ? (
          <Vacio titulo="Todavía no hubo transferencias">Elegí origen y destino arriba para hacer la primera.</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Producto</th>
                  <th className="numero">Unidades</th>
                  <th>De</th>
                  <th>A</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {ultimas.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">{momento(m.ocurridoAt)}</td>
                    <td>
                      <span className="font-bold">{m.producto}</span> {m.talle} {m.color}
                    </td>
                    <td className="numero font-bold">{m.cantidad}</td>
                    <td>{m.origen}</td>
                    <td>{m.destino}</td>
                    <td className="text-neutral-700">{m.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        )}
      </Tarjeta>
    </>
  );
}
