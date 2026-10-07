import Link from "next/link";
import { notFound } from "next/navigation";
import { anularCompraAccion } from "@/app/panel/acciones-compras";
import { momento, pesos, rangoDeFechas } from "@/componentes/formato";
import { BotonEnviar, Campo, ContenedorTabla, EncabezadoDePagina, Formulario, Indicador, Insignia, Tarjeta } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { detalleDeCompra } from "@/servidor/compras";

export default async function Compra({ params }: { params: Promise<{ id: string }> }) {
  const yo = await paginaConPermiso("ver");
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) notFound();
  const d = await detalleDeCompra(id);
  if (!d) notFound();
  const { compra } = d;
  const unidades = d.renglones.reduce((s, r) => s + r.cantidad, 0);
  const total = d.renglones.reduce((s, r) => s + Math.round(r.costoUnitario * 100) * r.cantidad, 0) / 100;

  return (
    <>
      <EncabezadoDePagina
        migas={[{ href: "/panel/compras", nombre: "Compras" }]}
        titulo={`Compra #${compra.id}`}
        descripcion={
          <span className="flex flex-wrap items-center gap-2">
            <Link href={`/panel/proveedores/${compra.proveedorId}`} className="font-bold underline">
              {d.proveedor}
            </Link>
            · {rangoDeFechas(compra.fecha, compra.fecha)} · {compra.comprobante ?? "sin comprobante"} · entró a {d.destino}
            {compra.anulada ? <Insignia tono="malo">Anulada</Insignia> : <Insignia tono="bueno">Vigente</Insignia>}
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Indicador titulo="Unidades" valor={unidades} />
        <Indicador titulo="Total a costo" valor={pesos(total)} />
        <Indicador titulo="Cargó" valor={d.cargo ?? "—"} detalle={momento(compra.creadoAt)} />
      </div>

      {compra.anulada && (
        <Tarjeta titulo="Anulada">
          <p>
            {d.anulo ?? "Alguien"} la anuló {compra.anuladaAt ? momento(compra.anuladaAt) : ""}: {compra.motivoAnulacion}
          </p>
        </Tarjeta>
      )}
      {compra.nota && <p className="text-neutral-700">Nota: {compra.nota}</p>}

      <Tarjeta titulo="Renglones">
        <ContenedorTabla>
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Talle</th>
                <th>Color</th>
                <th className="numero">Cantidad</th>
                <th className="numero">Costo unitario</th>
                <th className="numero">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {d.renglones.map((r) => (
                <tr key={r.varianteId}>
                  <td>
                    <Link href={`/panel/catalogo/${r.productoId}`} className="font-bold hover:underline">
                      {r.producto}
                    </Link>
                  </td>
                  <td className="font-mono">{r.sku}</td>
                  <td className="font-bold">{r.talle}</td>
                  <td>{r.color}</td>
                  <td className="numero">{r.cantidad}</td>
                  <td className="numero">{pesos(r.costoUnitario)}</td>
                  <td className="numero font-bold">{pesos(r.costoUnitario * r.cantidad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ContenedorTabla>
      </Tarjeta>

      <Tarjeta titulo="Movimientos que generó" descripcion="El libro mayor: lo que entró y, si se anuló, lo que salió.">
        <ul className="flex flex-col gap-1">
          {d.movimientos.map((m) => (
            <li key={m.id} className="flex gap-3">
              <Insignia tono={m.entra ? "info" : "malo"}>{m.entra ? "Entra" : "Sale"}</Insignia>
              <span>
                {m.cantidad} × <span className="font-bold">{m.producto}</span> {m.talle} {m.color}
              </span>
              <span className="ml-auto text-sm text-neutral-600">{momento(m.ocurridoAt)}</span>
            </li>
          ))}
        </ul>
      </Tarjeta>

      {!compra.anulada && puede(yo.rol, "operar") && (
        <Tarjeta titulo="Anular la compra" descripcion="Saca del destino lo que entró. Si parte ya se movió o se vendió, no se anula y te dice qué falta. El costo de las variantes no vuelve atrás: lo corrige la próxima compra.">
          <Formulario accion={anularCompraAccion.bind(null, compra.id)} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Campo etiqueta="Por qué se anula" name="motivo" required placeholder="Ej: remito cargado dos veces" />
            <BotonEnviar variante="peligro">Anular compra</BotonEnviar>
          </Formulario>
        </Tarjeta>
      )}
    </>
  );
}
