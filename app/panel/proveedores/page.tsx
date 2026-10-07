import Link from "next/link";
import { cambiarProveedorActivoAccion, crearProveedorAccion } from "@/app/panel/acciones-compras";
import { Boton, BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Insignia, Tarjeta, Vacio } from "@/componentes/primitivos";
import { rangoDeFechas } from "@/componentes/formato";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { listarProveedores } from "@/servidor/proveedores";

export default async function Proveedores() {
  const yo = await paginaConPermiso("ver");
  const opera = puede(yo.rol, "operar");
  const lista = await listarProveedores();

  return (
    <>
      <EncabezadoDePagina titulo="Proveedores" descripcion="A quién le compramos. Un proveedor con compras no se borra: se desactiva y deja de aparecer al cargar una compra." />

      <div className={`grid gap-6 ${opera ? "xl:grid-cols-[2fr_1fr]" : ""}`}>
        {lista.length === 0 ? (
          <Vacio titulo="Todavía no hay proveedores">{opera ? "Cargá el primero con el formulario." : "Cuando alguien cargue uno, aparece acá."}</Vacio>
        ) : (
          <ContenedorTabla>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>CUIT</th>
                  <th>Contacto</th>
                  <th className="numero">Compras</th>
                  <th>Última</th>
                  <th>Estado</th>
                  {opera && <th />}
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className={p.activo ? "" : "text-neutral-500"}>
                    <td>
                      <Link href={`/panel/proveedores/${p.id}`} className="font-bold underline">
                        {p.nombre}
                      </Link>
                    </td>
                    <td className="font-mono">{p.cuit ?? "—"}</td>
                    <td>{[p.telefono, p.email].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="numero">{p.compras}</td>
                    <td>{p.ultimaCompra ? rangoDeFechas(p.ultimaCompra, p.ultimaCompra) : "—"}</td>
                    <td>{p.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="malo">Inactivo</Insignia>}</td>
                    {opera && (
                      <td className="text-right">
                        <form action={cambiarProveedorActivoAccion.bind(null, p.id, !p.activo)}>
                          <Boton variante="secundario" className="min-h-11 text-sm">
                            {p.activo ? "Desactivar" : "Reactivar"}
                          </Boton>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </ContenedorTabla>
        )}

        {opera && (
          <Tarjeta titulo="Nuevo proveedor">
            <Formulario accion={crearProveedorAccion}>
              <Campo etiqueta="Nombre" name="nombre" required placeholder="Ej: Salomon Argentina" />
              <Campo etiqueta="CUIT (opcional)" name="cuit" placeholder="30-71234567-8" />
              <Campo etiqueta="Teléfono (opcional)" name="telefono" />
              <Campo etiqueta="Email (opcional)" name="email" type="email" />
              <Campo etiqueta="Nota (opcional)" name="nota" placeholder="Ej: entrega los martes" />
              <BotonEnviar>Crear proveedor</BotonEnviar>
            </Formulario>
          </Tarjeta>
        )}
      </div>
    </>
  );
}
