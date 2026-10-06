import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db/conexion";
import { ubicaciones, usuarios } from "@/db/esquema";
import { momento } from "@/componentes/formato";
import {
  Boton,
  Campo,
  ColumnaOrdenable,
  ContenedorTabla,
  EncabezadoDePagina,
  EnlaceBoton,
  Indicador,
  Insignia,
  Paginacion,
  Selector,
  Vacio,
} from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { POR_PAGINA, comoConsulta, parametrosPlanos, type ParametrosDeListado } from "@/servidor/listados";
import { listarMovimientos } from "@/servidor/movimientos";

const TIPOS = {
  carga_inicial: { nombre: "Ingreso", tono: "info" },
  transferencia: { nombre: "Transferencia", tono: "neutro" },
  venta: { nombre: "Venta", tono: "bueno" },
  devolucion: { nombre: "Devolución", tono: "info" },
  ajuste: { nombre: "Ajuste", tono: "alerta" },
  merma: { nombre: "Merma", tono: "malo" },
} as const;

export default async function Movimientos({ searchParams }: { searchParams: Promise<ParametrosDeListado> }) {
  await paginaConPermiso("ver");
  const parametros = await searchParams;
  const p = parametrosPlanos(parametros);
  const [listado, lugares, personas] = await Promise.all([
    listarMovimientos(parametros),
    // Todas, también los eventos cerrados: su historial se sigue consultando.
    db().select({ id: ubicaciones.id, nombre: ubicaciones.nombre }).from(ubicaciones).orderBy(asc(ubicaciones.id)),
    db().select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).orderBy(asc(usuarios.nombre)),
  ]);
  const filtrado = Object.entries(p).some(([clave, valor]) => valor && !["orden", "dir", "pagina"].includes(clave));

  return (
    <>
      <EncabezadoDePagina
        titulo="Movimientos"
        descripcion="El libro mayor del stock: cada entrada y salida, con quién la hizo. No se edita ni se borra: una corrección es otro movimiento."
        acciones={<EnlaceBoton href={`/panel/exportar/movimientos${comoConsulta(p)}`}>Exportar CSV</EnlaceBoton>}
      />

      <div className="grid grid-cols-2 gap-3">
        <Indicador titulo="Movimientos" valor={listado.total.toLocaleString("es-AR")} detalle={filtrado ? "Con los filtros aplicados" : "Todos"} />
        <Indicador titulo="Unidades movidas" valor={listado.unidades.toLocaleString("es-AR")} />
      </div>

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-3 md:items-end 2xl:grid-cols-6">
        <Campo etiqueta="Producto, SKU o nota" name="q" defaultValue={p.q} />
        <Selector etiqueta="Tipo" name="tipo" defaultValue={p.tipo ?? ""}>
          <option value="">Todos</option>
          {Object.entries(TIPOS).map(([valor, t]) => (
            <option key={valor} value={valor}>
              {t.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Ubicación (sale o entra)" name="ubicacion" defaultValue={p.ubicacion ?? ""}>
          <option value="">Todas</option>
          {lugares.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Quién" name="usuario" defaultValue={p.usuario ?? ""}>
          <option value="">Todos</option>
          {personas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={p.desde} />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={p.hasta} />
        <div className="flex gap-2 md:col-span-3 2xl:col-span-6">
          <Boton type="submit">Filtrar</Boton>
          {filtrado && <EnlaceBoton href="/panel/movimientos">Limpiar filtros</EnlaceBoton>}
        </div>
      </form>

      {listado.filas.length === 0 ? (
        <Vacio titulo="No hay movimientos con estos filtros">Probá sacando algún filtro.</Vacio>
      ) : (
        <>
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <ColumnaOrdenable campo="fecha" ruta="/panel/movimientos" parametros={p}>
                    N.º · Registrado
                  </ColumnaOrdenable>
                  <ColumnaOrdenable campo="tipo" ruta="/panel/movimientos" parametros={p}>
                    Tipo
                  </ColumnaOrdenable>
                  <th>Producto</th>
                  <ColumnaOrdenable campo="cantidad" ruta="/panel/movimientos" parametros={p} numero>
                    Unid.
                  </ColumnaOrdenable>
                  <th>Sale de</th>
                  <th>Entra a</th>
                  <th>Quién</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {listado.filas.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-neutral-600">#{m.id}</span> {momento(m.recibidoAt)}
                    </td>
                    <td>
                      <Insignia tono={TIPOS[m.tipo].tono}>{TIPOS[m.tipo].nombre}</Insignia>
                    </td>
                    <td>
                      <Link href={`/panel/catalogo/${m.productoId}`} className="font-bold hover:underline">
                        {m.producto}
                      </Link>{" "}
                      {m.talle} {m.color} <span className="font-mono text-neutral-600">{m.sku}</span>
                    </td>
                    <td className="numero font-bold">{m.cantidad}</td>
                    <td>{m.origen ?? "—"}</td>
                    <td>{m.destino ?? "—"}</td>
                    <td>{m.usuario ?? m.celular ?? "—"}</td>
                    <td className="text-neutral-700">
                      {m.tipo === "venta" && m.refId ? (
                        <Link href={`/panel/ventas/${m.refId}`} className="underline">
                          Venta #{m.refId}
                        </Link>
                      ) : (
                        m.nota
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion ruta="/panel/movimientos" parametros={p} pagina={listado.pagina} porPagina={POR_PAGINA} total={listado.total} />
        </>
      )}
    </>
  );
}
