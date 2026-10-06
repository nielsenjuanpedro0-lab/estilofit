import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/conexion";
import { auditoria, usuarios } from "@/db/esquema";
import { ESTADO_EVENTO, momento, pesos, rangoDeFechas } from "@/componentes/formato";
import { Aviso, ContenedorTabla, EncabezadoDePagina, EnlaceBoton, Indicador, Insignia, Tarjeta, Vacio } from "@/componentes/primitivos";
import { puede } from "@/contrato/permisos";
import { paginaConPermiso } from "@/servidor/acceso";
import { datosDelTablero } from "@/servidor/tablero";

export default async function Inicio({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const yo = await paginaConPermiso("ver");
  const { aviso } = await searchParams;
  const d = await datosDelTablero();
  const actividad = puede(yo.rol, "administrar")
    ? await db()
        .select({ id: auditoria.id, ocurridoAt: auditoria.ocurridoAt, accion: auditoria.accion, detalle: auditoria.detalle, usuario: usuarios.nombre })
        .from(auditoria)
        .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
        .orderBy(desc(auditoria.id))
        .limit(8)
    : [];
  const ticket = d.periodo.ventas > 0 ? d.periodo.facturado / d.periodo.ventas : 0;

  return (
    <>
      <EncabezadoDePagina
        titulo={`Hola, ${yo.nombre.split(" ")[0]}`}
        descripcion={`Así vienen los últimos ${d.dias} días y lo que hay para mirar hoy.`}
        acciones={
          puede(yo.rol, "operar") && (
            <>
              <EnlaceBoton href="/panel/eventos" variante="destacado">
                + Nuevo evento
              </EnlaceBoton>
              <EnlaceBoton href="/panel/transferencias">Transferir stock</EnlaceBoton>
            </>
          )
        }
      />
      {aviso === "sin-permiso" && <Aviso tono="atencion">Tu rol no tiene acceso a esa sección. Si la necesitás, pedíselo a un administrador.</Aviso>}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Indicador titulo={`Facturado · ${d.dias} días`} valor={pesos(d.periodo.facturado)} detalle={`${d.periodo.ventas} ventas · ticket ${pesos(ticket)}`} href="/panel/ventas" />
        <Indicador titulo={`Unidades · ${d.dias} días`} valor={d.periodo.unidades.toLocaleString("es-AR")} detalle="Vendidas en eventos" href="/panel/reportes" />
        <Indicador
          titulo="Para revisar"
          valor={d.paraRevisar}
          tono={d.paraRevisar > 0 ? "alerta" : "bueno"}
          detalle={d.paraRevisar > 0 ? "Ventas aceptadas que piden una mirada" : "Nada pendiente"}
          href="/panel/ventas?estado=revisar"
        />
        <Indicador
          titulo="Stock en depósito y showroom"
          valor={d.stock.unidades.toLocaleString("es-AR")}
          detalle={`${pesos(d.stock.valor)} a precio de lista`}
          href="/panel/stock"
        />
      </div>

      {d.celularesConPendientes.length > 0 && (
        <Aviso tono="atencion">
          <p className="font-black">Hay celulares con ventas sin subir</p>
          <ul className="mt-1 list-disc pl-5">
            {d.celularesConPendientes.map((c) => (
              <li key={c.id}>
                {c.nombre}: {c.pendientes} {c.pendientes === 1 ? "venta" : "ventas"}
                {c.informadoAt ? ` (informado ${momento(c.informadoAt)})` : ""}. Se suben solas cuando el celular tenga señal.
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Tarjeta
          titulo="Eventos en curso"
          descripcion="En preparación o abiertos"
          acciones={
            <Link href="/panel/eventos" className="text-sm font-bold underline">
              Ver todos
            </Link>
          }
        >
          {d.enCurso.length === 0 ? (
            <Vacio titulo="No hay eventos en curso">Creá el próximo evento y cargale el viaje desde el depósito.</Vacio>
          ) : (
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Evento</th>
                    <th>Estado</th>
                    <th className="numero">En el evento</th>
                    <th className="numero">Vendidas</th>
                    <th className="numero">Facturado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.enCurso.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/panel/eventos/${e.id}`} className="font-bold underline">
                          {e.nombre}
                        </Link>
                        <div className="text-xs text-neutral-600">{rangoDeFechas(e.fechaDesde, e.fechaHasta)}</div>
                      </td>
                      <td>
                        <Insignia tono={e.estado === "abierto" ? "bueno" : "alerta"}>{ESTADO_EVENTO[e.estado]}</Insignia>
                      </td>
                      <td className="numero">{e.llevadas - e.vendidas - e.devueltas}</td>
                      <td className="numero">{e.vendidas}</td>
                      <td className="numero">{pesos(e.facturado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          )}
        </Tarjeta>

        <Tarjeta titulo="Lo más vendido" descripcion={`Últimos ${d.dias} días`}>
          {d.masVendidos.length === 0 ? (
            <p className="text-neutral-700">Sin ventas en el período.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {d.masVendidos.map((p, i) => (
                <li key={p.productoId} className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black font-black text-yellow-300">{i + 1}</span>
                  <Link href={`/panel/catalogo/${p.productoId}`} className="min-w-0 flex-1 truncate font-bold hover:underline">
                    {p.producto}
                  </Link>
                  <span className="font-black tabular-nums">{p.unidades} u.</span>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Tarjeta titulo="Stock bajo" descripcion={`Variantes con ${d.umbralStockBajo} o menos entre depósito y showroom`}>
          {d.stockBajo.length === 0 ? (
            <p className="text-neutral-700">Todo el catálogo activo tiene más de {d.umbralStockBajo} unidades.</p>
          ) : (
            <ContenedorTabla>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Talle</th>
                    <th>SKU</th>
                    <th className="numero">Quedan</th>
                  </tr>
                </thead>
                <tbody>
                  {d.stockBajo.map((v) => (
                    <tr key={v.varianteId}>
                      <td>
                        <Link href={`/panel/catalogo/${v.productoId}`} className="font-bold hover:underline">
                          {v.producto}
                        </Link>{" "}
                        <span className="text-neutral-600">{v.color}</span>
                      </td>
                      <td className="font-bold">{v.talle}</td>
                      <td className="font-mono">{v.sku}</td>
                      <td className={`numero font-black ${v.cantidad <= 0 ? "text-red-700" : ""}`}>{v.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          )}
        </Tarjeta>

        {puede(yo.rol, "administrar") && (
          <Tarjeta
            titulo="Actividad reciente"
            acciones={
              <Link href="/panel/auditoria" className="text-sm font-bold underline">
                Ver auditoría
              </Link>
            }
          >
            {actividad.length === 0 ? (
              <p className="text-neutral-700">Todavía no hay actividad registrada.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-neutral-200">
                {actividad.map((a) => (
                  <li key={a.id} className="py-2">
                    <p className="text-sm">
                      <span className="font-black">{a.usuario ?? "Sistema"}</span> · <span className="text-neutral-600">{momento(a.ocurridoAt)}</span>
                    </p>
                    <p className="text-sm">{a.detalle}</p>
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
        )}
      </div>
    </>
  );
}
