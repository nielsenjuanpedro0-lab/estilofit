import { notFound, redirect } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ConteoDeCierre } from "@/app/panel/eventos/[id]/cierre/conteo-de-cierre";
import { db } from "@/db/conexion";
import { ubicaciones } from "@/db/esquema";
import { momento, rangoDeFechas } from "@/componentes/formato";
import { Aviso, EncabezadoDePagina, Vacio } from "@/componentes/primitivos";
import { paginaConPermiso } from "@/servidor/acceso";
import { datosParaCierre } from "@/servidor/cierre";

type Celular = NonNullable<Awaited<ReturnType<typeof datosParaCierre>>>["celulares"][number];

// Lo que el cierre sabe de cada celular que bajó el evento. Un faltante puede ser una venta
// que sigue en un celular sin señal: mejor saberlo antes de asentarlo.
function AvisoDeCelular({ celular }: { celular: Celular }) {
  if (celular.revocadoAt) return null;
  if (celular.pendientes === null) {
    return (
      <Aviso tono="atencion">
        <span className="font-black">{celular.nombre}</span> bajó el evento y nunca informó sus ventas. Puede tener ventas sin subir: abrí la app
        con señal en ese celular antes de cerrar.
      </Aviso>
    );
  }
  if (celular.pendientes > 0) {
    return (
      <Aviso tono="error">
        <span className="font-black">
          {celular.nombre} tiene {celular.pendientes} {celular.pendientes === 1 ? "venta" : "ventas"} sin subir
        </span>{" "}
        (informado {celular.pendientesAt ? momento(celular.pendientesAt) : ""}). Si cerrás ahora, esas unidades van a aparecer como faltantes.
        Conectalo a internet y esperá a que el contador del celular llegue a 0.
      </Aviso>
    );
  }
  return (
    <Aviso tono="exito">
      <span className="font-black">{celular.nombre}</span>: todas las ventas subidas
      {celular.ultimoContactoAt ? ` (último contacto ${momento(celular.ultimoContactoAt)})` : ""}.
    </Aviso>
  );
}

export default async function CierreDeEvento({ params }: { params: Promise<{ id: string }> }) {
  await paginaConPermiso("operar");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const datos = await datosParaCierre(id);
  if (!datos) notFound();
  if (datos.evento.estado === "cerrado") redirect(`/panel/eventos/${id}`);

  const destinos = await db()
    .select({ id: ubicaciones.id, nombre: ubicaciones.nombre })
    .from(ubicaciones)
    .where(and(eq(ubicaciones.activa, true), inArray(ubicaciones.tipo, ["deposito", "showroom"])))
    .orderBy(asc(ubicaciones.id));

  return (
    <>
      <EncabezadoDePagina
        migas={[
          { href: "/panel/eventos", nombre: "Eventos" },
          { href: `/panel/eventos/${id}`, nombre: datos.evento.nombre },
        ]}
        titulo="Cierre de evento"
        descripcion={
          <>
            <p className="font-bold">
              {datos.evento.nombre} · {datos.evento.lugar} · {rangoDeFechas(datos.evento.fechaDesde, datos.evento.fechaHasta)}
            </p>
            <p>
              Contá cuántas unidades volvieron de cada variante. El sistema las compara contra lo esperado (lo que salió menos lo vendido) y
              marca cada diferencia. Al confirmar, las diferencias quedan asentadas con fecha y el remanente vuelve al depósito. Nada se borra
              ni se pisa.
            </p>
          </>
        }
      />

      {datos.celulares.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xl font-black">Celulares de este evento</h2>
          {datos.celulares.map((c) => (
            <AvisoDeCelular key={c.id} celular={c} />
          ))}
        </section>
      )}

      {datos.filas.length === 0 ? (
        <Vacio titulo="Este evento no tiene stock para contar">Nunca se le cargó mercadería. Podés cargarle el viaje desde la página del evento.</Vacio>
      ) : (
        <ConteoDeCierre eventoId={id} filas={datos.filas} destinos={destinos} />
      )}
    </>
  );
}
