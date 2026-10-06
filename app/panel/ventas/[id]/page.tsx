import Link from "next/link";
import { notFound } from "next/navigation";
import { marcarRevisadaAccion } from "@/app/panel/acciones";
import { MEDIO_DE_PAGO, momento, pesos } from "@/componentes/formato";
import { BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Insignia, Tarjeta } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { ventaConDetalle } from "@/servidor/ventas";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-200 py-2 last:border-0">
      <dt className="text-sm font-bold text-neutral-700">{etiqueta}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

export default async function DetalleDeVenta({ params }: { params: Promise<{ id: string }> }) {
  const yo = await paginaConPermiso("ver");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const datos = await ventaConDetalle(id);
  if (!datos) notFound();
  const { venta, renglones, asientos } = datos;
  const diferencia = venta.total - venta.totalCatalogo;
  const pendiente = venta.paraRevisar && !venta.revisadaAt;

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/ventas", nombre: "Ventas" }]}
        titulo={`Venta #${venta.id}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            {pesos(venta.total)} en {MEDIO_DE_PAGO[venta.medioPago].toLowerCase()} ·
            {pendiente ? <Insignia tono="alerta">Para revisar</Insignia> : venta.paraRevisar ? <Insignia tono="info">Revisada</Insignia> : <Insignia tono="bueno">OK</Insignia>}
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Tarjeta titulo="Qué se vendió">
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Talle</th>
                    <th>Color</th>
                    <th>SKU</th>
                    <th className="numero">Cant.</th>
                    <th className="numero">Precio de lista</th>
                    <th className="numero">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {renglones.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/panel/catalogo/${r.productoId}`} className="font-bold hover:underline">
                          {r.producto}
                        </Link>
                      </td>
                      <td className="font-bold">{r.talle}</td>
                      <td>{r.color}</td>
                      <td className="font-mono">{r.sku}</td>
                      <td className="numero">{r.cantidad}</td>
                      <td className="numero">{pesos(r.precioUnitario)}</td>
                      <td className="numero">{pesos(r.precioUnitario * r.cantidad)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total según el catálogo</td>
                    <td className="numero">{pesos(venta.totalCatalogo)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6}>Cobrado según el celular</td>
                    <td className="numero">{pesos(venta.total)}</td>
                  </tr>
                  {diferencia !== 0 && (
                    <tr>
                      <td colSpan={6}>Diferencia</td>
                      <td className={`numero ${diferencia < 0 ? "text-red-700" : "text-sky-800"}`}>{pesos(diferencia)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </ContenedorTabla>
          </Tarjeta>

          <Tarjeta titulo="Movimientos que generó" descripcion="Cada renglón descontó stock del evento con una clave propia derivada de la venta: si el celular la reenvía, no se descuenta dos veces.">
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Movimiento</th>
                    <th>SKU</th>
                    <th className="numero">Unidades</th>
                    <th>Clave</th>
                    <th>Registrado</th>
                  </tr>
                </thead>
                <tbody>
                  {asientos.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono">#{a.id}</td>
                      <td className="font-mono">{a.sku}</td>
                      <td className="numero">−{a.cantidad}</td>
                      <td className="font-mono text-xs">{a.clientUuid}</td>
                      <td className="whitespace-nowrap">{momento(a.recibidoAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          </Tarjeta>
        </div>

        <div className="flex flex-col gap-6">
          <Tarjeta titulo="Datos">
            <dl>
              <Dato etiqueta="Evento">
                {venta.eventoId ? (
                  <Link href={`/panel/eventos/${venta.eventoId}`} className="font-bold underline">
                    {datos.evento}
                  </Link>
                ) : (
                  "—"
                )}
              </Dato>
              <Dato etiqueta="Vendedor">{datos.vendedor ?? "Sin vendedor"}</Dato>
              <Dato etiqueta="Celular">{datos.celular}</Dato>
              <Dato etiqueta="Medio de pago">{MEDIO_DE_PAGO[venta.medioPago]}</Dato>
              <Dato etiqueta="Llegó al servidor">{momento(venta.recibidoAt)}</Dato>
              <Dato etiqueta="Hora del celular">{momento(venta.vendidoAt)}</Dato>
              <Dato etiqueta="Código">
                <span className="font-mono text-xs break-all">{venta.clientUuid}</span>
              </Dato>
            </dl>
          </Tarjeta>

          {venta.paraRevisar && (
            <Tarjeta titulo="Revisión" descripcion="Entró igual porque la plata ya se había cobrado. Queda el rastro de por qué y de quién la revisó.">
              <p className="mb-3 rounded-lg bg-amber-50 p-3 font-bold text-amber-950">{venta.motivoRevision}</p>
              {venta.revisadaAt ? (
                <dl>
                  <Dato etiqueta="Revisó">{datos.revisor ?? "—"}</Dato>
                  <Dato etiqueta="Cuándo">{momento(venta.revisadaAt)}</Dato>
                  <Dato etiqueta="Conclusión">{venta.notaDeRevision}</Dato>
                </dl>
              ) : puede(yo.rol, "operar") ? (
                <Formulario accion={marcarRevisadaAccion.bind(null, venta.id)}>
                  <Campo etiqueta="Qué se concluyó" name="nota" required placeholder="Ej: redondeo acordado con el cliente" />
                  <BotonEnviar>Marcar como revisada</BotonEnviar>
                </Formulario>
              ) : (
                <p className="text-sm">La revisa un encargado o un administrador.</p>
              )}
            </Tarjeta>
          )}
        </div>
      </div>
    </>
  );
}
