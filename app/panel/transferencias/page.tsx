import { and, asc, desc, eq, isNull, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { transferirAccion } from "@/app/panel/acciones";
import { ElegirStock } from "@/app/panel/elegir-stock";
import { db } from "@/db/conexion";
import { eventos, movimientos, productos, ubicaciones, variantes } from "@/db/esquema";
import { momento, TIPO_UBICACION } from "@/componentes/formato";
import { Aviso, Boton, Selector, Vacio } from "@/componentes/primitivos";
import { stockConNombres } from "@/servidor/transferencias";

const origen = alias(ubicaciones, "origen");
const destino = alias(ubicaciones, "destino");

export default async function Transferencias({ searchParams }: { searchParams: Promise<{ origen?: string; destino?: string }> }) {
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
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">Transferencias</h1>
      <p className="max-w-3xl">
        Para mover mercadería entre depósito, showroom y eventos: reponer el showroom, mandar refuerzos a un evento o pasar stock de un
        equipo a otro. Si al origen le falta algo, no se mueve nada y te dice qué bajar.
      </p>

      <form className="grid gap-3 rounded-lg border-2 border-black p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
          <ElegirStock
            key={`${elegidoOrigen.id}-${elegidoDestino.id}`}
            disponibles={disponibles}
            mover={transferirAccion.bind(null, elegidoOrigen.id, elegidoDestino.id)}
            destino={elegidoDestino.nombre}
          />
        ))}

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-black">Últimas transferencias</h2>
        {ultimas.length === 0 ? (
          <Vacio titulo="Todavía no hubo transferencias">Elegí origen y destino arriba para hacer la primera.</Vacio>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-black">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-neutral-100">
                <tr>
                  <th className="p-2">Cuándo</th>
                  <th className="p-2">Producto</th>
                  <th className="p-2 text-right">Unidades</th>
                  <th className="p-2">De</th>
                  <th className="p-2">A</th>
                  <th className="p-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {ultimas.map((m) => (
                  <tr key={m.id} className="border-t border-neutral-300">
                    <td className="p-2 whitespace-nowrap">{momento(m.ocurridoAt)}</td>
                    <td className="p-2">
                      <span className="font-bold">{m.producto}</span> {m.talle} {m.color}
                    </td>
                    <td className="p-2 text-right font-bold tabular-nums">{m.cantidad}</td>
                    <td className="p-2">{m.origen}</td>
                    <td className="p-2">{m.destino}</td>
                    <td className="p-2 text-neutral-700">{m.nota}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
