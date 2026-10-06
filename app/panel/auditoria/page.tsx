import { asc, sql } from "drizzle-orm";
import { db } from "@/db/conexion";
import { auditoria, usuarios } from "@/db/esquema";
import { momento } from "@/componentes/formato";
import { Boton, Campo, ColumnaOrdenable, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Insignia, Paginacion, Selector, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { listarAuditoria } from "@/servidor/auditoria";
import { POR_PAGINA, comoConsulta, parametrosPlanos, type ParametrosDeListado } from "@/servidor/listados";

export default async function Auditoria({ searchParams }: { searchParams: Promise<ParametrosDeListado> }) {
  await paginaConPermiso("administrar");
  const parametros = await searchParams;
  const p = parametrosPlanos(parametros);
  const [listado, personas, areas] = await Promise.all([
    listarAuditoria(parametros),
    db().select({ id: usuarios.id, nombre: usuarios.nombre }).from(usuarios).orderBy(asc(usuarios.nombre)),
    db().selectDistinct({ accion: auditoria.accion }).from(auditoria).orderBy(sql`1`),
  ]);
  const filtrado = Object.entries(p).some(([clave, valor]) => valor && !["orden", "dir", "pagina"].includes(clave));

  return (
    <>
      <EncabezadoDePagina
        titulo="Auditoría"
        descripcion="Quién hizo qué en el panel y cuándo. Se registra sola en cada cambio y no se puede editar ni borrar. Las claves y los PIN nunca aparecen."
        acciones={<EnlaceBoton href={`/panel/exportar/auditoria${comoConsulta(p)}`}>Exportar CSV</EnlaceBoton>}
      />

      <form className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-3 xl:grid-cols-5 xl:items-end">
        <Campo etiqueta="Buscar en el detalle" name="q" defaultValue={p.q} placeholder="Ej: precio, Tandil, Lucía" />
        <Selector etiqueta="Quién" name="usuario" defaultValue={p.usuario ?? ""}>
          <option value="">Todos</option>
          {personas.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Área" name="accion" defaultValue={p.accion ?? ""}>
          <option value="">Todas</option>
          {areas.map((a) => (
            <option key={a.accion}>{a.accion}</option>
          ))}
        </Selector>
        <Campo etiqueta="Desde" name="desde" type="date" defaultValue={p.desde} />
        <Campo etiqueta="Hasta" name="hasta" type="date" defaultValue={p.hasta} />
        <div className="flex gap-2 md:col-span-3 xl:col-span-5">
          <Boton type="submit">Filtrar</Boton>
          {filtrado && <EnlaceBoton href="/panel/auditoria">Limpiar filtros</EnlaceBoton>}
        </div>
      </form>

      {listado.filas.length === 0 ? (
        <Vacio titulo="No hay registros con estos filtros">Probá sacando algún filtro.</Vacio>
      ) : (
        <>
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <ColumnaOrdenable campo="fecha" ruta="/panel/auditoria" parametros={p}>
                    Cuándo
                  </ColumnaOrdenable>
                  <ColumnaOrdenable campo="usuario" ruta="/panel/auditoria" parametros={p}>
                    Quién
                  </ColumnaOrdenable>
                  <ColumnaOrdenable campo="accion" ruta="/panel/auditoria" parametros={p}>
                    Área
                  </ColumnaOrdenable>
                  <th>Qué hizo</th>
                </tr>
              </thead>
              <tbody>
                {listado.filas.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">{momento(a.ocurridoAt)}</td>
                    <td className="font-bold">{a.usuario ?? "Sistema"}</td>
                    <td>
                      <Insignia>{a.accion}</Insignia>
                    </td>
                    <td>{a.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
          <Paginacion ruta="/panel/auditoria" parametros={p} pagina={listado.pagina} porPagina={POR_PAGINA} total={listado.total} />
        </>
      )}
    </>
  );
}
