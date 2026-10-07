import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { editarProveedorAccion } from "@/app/panel/acciones-compras";
import { db } from "@/db/conexion";
import { proveedores } from "@/db/esquema";
import { pesos, rangoDeFechas } from "@/componentes/formato";
import { BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Formulario, Indicador, Insignia, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { listarCompras } from "@/servidor/compras";
import { loMasCompradoA } from "@/servidor/proveedores";

export default async function Proveedor({ params }: { params: Promise<{ id: string }> }) {
  const yo = await paginaConPermiso("ver");
  const opera = puede(yo.rol, "operar");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [proveedor] = await db().select().from(proveedores).where(eq(proveedores.id, id));
  if (!proveedor) notFound();

  const [historial, masComprado] = await Promise.all([listarCompras({ proveedor: String(id) }, true), loMasCompradoA(id)]);
  const vigentes = historial.filas.filter((c) => !c.anulada);
  const total = vigentes.reduce((s, c) => s + c.total, 0);

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/proveedores", nombre: "Proveedores" }]}
        titulo={proveedor.nombre}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            {proveedor.cuit ? `CUIT ${proveedor.cuit}` : "Sin CUIT"}
            {proveedor.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Inactivo</Insignia>}
          </span>
        }
        acciones={opera && proveedor.activo ? <EnlaceBoton href={`/panel/compras/nueva?proveedor=${id}`} variante="primario">+ Nueva compra</EnlaceBoton> : undefined}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Indicador titulo="Compras" valor={vigentes.length} detalle={historial.filas.length > vigentes.length ? `${historial.filas.length - vigentes.length} anuladas` : undefined} />
        <Indicador titulo="Comprado a costo" valor={pesos(total)} />
        <Indicador titulo="Unidades" valor={vigentes.reduce((s, c) => s + c.unidades, 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Tarjeta titulo="Compras">
          {historial.filas.length === 0 ? (
            <Vacio titulo="Todavía no hay compras">Cuando se cargue una, aparece acá.</Vacio>
          ) : (
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>N.º</th>
                    <th>Fecha</th>
                    <th>Comprobante</th>
                    <th>Destino</th>
                    <th className="numero">Unid.</th>
                    <th className="numero">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {historial.filas.map((c) => (
                    <tr key={c.id} className={c.anulada ? "text-neutral-500 line-through" : ""}>
                      <td>
                        <Link href={`/panel/compras/${c.id}`} className="font-black underline">
                          #{c.id}
                        </Link>
                      </td>
                      <td>{rangoDeFechas(c.fecha, c.fecha)}</td>
                      <td>{c.comprobante ?? "—"}</td>
                      <td>{c.destino}</td>
                      <td className="numero">{c.unidades}</td>
                      <td className="numero font-bold">{pesos(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Lo que más le compramos">
          {masComprado.length === 0 ? (
            <Vacio titulo="Sin compras">—</Vacio>
          ) : (
            <ol className="flex flex-col gap-2">
              {masComprado.map((p, i) => (
                <li key={p.productoId} className="flex items-baseline gap-2">
                  <span className="w-6 font-black tabular-nums">{i + 1}</span>
                  <Link href={`/panel/catalogo/${p.productoId}`} className="flex-1 truncate hover:underline">
                    <span className="font-bold">{p.producto}</span> <span className="text-neutral-600">{p.marca}</span>
                  </Link>
                  <span className="font-black tabular-nums">{p.unidades} u.</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>

      {opera && (
        <Tarjeta titulo="Datos del proveedor">
          <Formulario accion={editarProveedorAccion.bind(null, proveedor.id)} className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Campo etiqueta="Nombre" name="nombre" defaultValue={proveedor.nombre} required />
            <Campo etiqueta="CUIT" name="cuit" defaultValue={proveedor.cuit ?? ""} />
            <Campo etiqueta="Teléfono" name="telefono" defaultValue={proveedor.telefono ?? ""} />
            <Campo etiqueta="Email" name="email" type="email" defaultValue={proveedor.email ?? ""} />
            <Campo etiqueta="Nota" name="nota" defaultValue={proveedor.nota ?? ""} />
            <BotonEnviar className="sm:col-span-2">Guardar datos</BotonEnviar>
          </Formulario>
        </Tarjeta>
      )}
    </>
  );
}
