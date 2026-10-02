"use client";

import { liveQuery } from "dexie";
import { useEffect, useState, type FormEvent } from "react";
import { almacen, type EventoBajado, type Sesion, type VentaLocal } from "@/celular/almacen";
import { darDeAlta, pedirEventos } from "@/celular/api";
import { sincronizar } from "@/celular/cola";
import { IndicadorDeCola } from "@/celular/indicador-de-cola";
import { descargarPaquete, quitarEvento } from "@/celular/paquete";
import { rangoDeFechas, momento, pesos } from "@/componentes/formato";
import type { EventoParaCelular } from "@/contrato/paquete";
import { Aviso, Boton, Campo, Vacio } from "@/componentes/primitivos";

type Datos = { sesion: Sesion | null; eventos: (EventoBajado & { variantes: number })[]; rechazadas: VentaLocal[] };

function useDatosDelCelular() {
  const [datos, setDatos] = useState<Datos | null>(null);
  useEffect(() => {
    const suscripcion = liveQuery(async (): Promise<Datos> => {
      const eventos = await almacen.eventos.toArray();
      return {
        sesion: (await almacen.sesion.get(1)) ?? null,
        eventos: await Promise.all(eventos.map(async (e) => ({ ...e, variantes: await almacen.variantes.where("eventoId").equals(e.id).count() }))),
        rechazadas: await almacen.ventas.where("estado").equals("rechazada").toArray(),
      };
    }).subscribe({
      next: setDatos,
      error: (error: unknown) => {
        throw error;
      },
    });
    return () => suscripcion.unsubscribe();
  }, []);
  return datos;
}

// Si la página no está guardada por el service worker, en modo avión no abre. Mejor saberlo en el depósito.
function useListoSinConexion() {
  const [listo, setListo] = useState<boolean | null>(null);
  useEffect(() => {
    async function revisar() {
      const controlada = navigator.serviceWorker?.controller != null;
      const guardada = "caches" in window && (await caches.match("/vender", { ignoreSearch: true })) !== undefined;
      setListo(controlada && guardada);
    }
    void revisar();
    navigator.serviceWorker?.addEventListener("controllerchange", revisar);
    return () => navigator.serviceWorker?.removeEventListener("controllerchange", revisar);
  }, []);
  return listo;
}

function Alta({ revocado }: { revocado: boolean }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const codigo = new FormData(evento.currentTarget).get("codigo");
    if (typeof codigo !== "string" || !codigo.trim()) return setMensaje("Escribí el código que aparece en el panel, en Dispositivos.");
    setEnviando(true);
    const resultado = await darDeAlta(codigo).finally(() => setEnviando(false));
    if (!resultado.ok) return setMensaje(resultado.mensaje);
    const { token, dispositivo } = resultado.datos;
    await almacen.sesion.put({ id: 1, token, dispositivoId: dispositivo.id, dispositivoNombre: dispositivo.nombre, revocado: false });
    // Pide que el navegador no borre las ventas guardadas si el teléfono se queda sin espacio.
    await navigator.storage?.persist?.();
    void sincronizar({ sinEsperar: true });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 rounded-lg border-2 border-black p-4">
      <h2 className="text-xl font-black">Dar de alta este celular</h2>
      {revocado && <Aviso tono="error">Este celular fue revocado desde el panel. Las ventas guardadas no se pierden: dalo de alta de nuevo y se suben.</Aviso>}
      <p>En el panel, entrá a Dispositivos, generá un código y escribilo acá. Hace falta señal.</p>
      <Campo etiqueta="Código de alta" name="codigo" autoComplete="off" autoCapitalize="characters" placeholder="ABCD-EFGH" className="min-h-14 rounded-lg border-2 border-black px-3 font-mono text-2xl uppercase" />
      <Boton type="submit" disabled={enviando}>
        {enviando ? "Dando de alta…" : "Dar de alta"}
      </Boton>
      {mensaje && <Aviso tono="error">{mensaje}</Aviso>}
    </form>
  );
}

function QuitarEvento({ eventoId }: { eventoId: number }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  async function quitar() {
    const resultado = await quitarEvento(eventoId);
    if (!resultado.ok) setMensaje(resultado.mensaje);
  }
  return (
    <details>
      <summary className="flex min-h-12 cursor-pointer items-center text-sm font-bold underline">Quitar este evento del celular</summary>
      <p className="my-2 text-sm">Borra el catálogo y el stock bajados. Las ventas no se tocan. Si ya terminó el evento, libera espacio.</p>
      <Boton variante="peligro" onClick={quitar}>
        Sí, quitarlo
      </Boton>
      {mensaje && (
        <div className="mt-2">
          <Aviso tono="error">{mensaje}</Aviso>
        </div>
      )}
    </details>
  );
}

function EventosDelServidor({ token, bajados }: { token: string; bajados: Set<number> }) {
  const [eventos, setEventos] = useState<EventoParaCelular[] | null>(null);
  const [mensaje, setMensaje] = useState<{ tono: "error" | "exito"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<number | "lista" | null>(null);

  async function buscar() {
    setOcupado("lista");
    setMensaje(null);
    const resultado = await pedirEventos(token).finally(() => setOcupado(null));
    if (!resultado.ok) {
      if (resultado.revocado) await almacen.sesion.update(1, { revocado: true });
      return setMensaje({ tono: "error", texto: resultado.mensaje });
    }
    setEventos(resultado.datos.eventos);
  }

  async function bajar(eventoId: number) {
    setOcupado(eventoId);
    setMensaje(null);
    const resultado = await descargarPaquete(eventoId).finally(() => setOcupado(null));
    setMensaje(
      resultado.ok
        ? { tono: "exito", texto: `Paquete descargado: ${resultado.variantes} variantes, ${resultado.unidades} unidades. Listo para vender sin conexión.` }
        : { tono: "error", texto: resultado.mensaje },
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border-2 border-black p-4">
      <h2 className="text-xl font-black">Bajar un evento</h2>
      <p>Hacelo con señal, antes de salir. Baja catálogo, precios, imágenes y el stock asignado.</p>
      <Boton variante="secundario" onClick={buscar} disabled={ocupado !== null}>
        {ocupado === "lista" ? "Buscando…" : "Ver eventos disponibles"}
      </Boton>
      {eventos?.length === 0 && <Vacio titulo="No hay eventos abiertos">Creá el evento en el panel y cargale el stock que viaja.</Vacio>}
      {eventos?.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-2 border-t border-neutral-300 pt-3">
          <div className="flex-1">
            <p className="font-bold">{e.nombre}</p>
            <p className="text-sm">
              {e.lugar} · {rangoDeFechas(e.fechaDesde, e.fechaHasta)}
            </p>
          </div>
          <Boton onClick={() => bajar(e.id)} disabled={ocupado !== null}>
            {ocupado === e.id ? "Bajando…" : bajados.has(e.id) ? "Actualizar paquete" : "Bajar paquete"}
          </Boton>
        </div>
      ))}
      {mensaje && <Aviso tono={mensaje.tono}>{mensaje.texto}</Aviso>}
    </section>
  );
}

export function InicioCelular() {
  const datos = useDatosDelCelular();
  const listoSinConexion = useListoSinConexion();
  const [reenvio, setReenvio] = useState<string | null>(null);

  async function reenviarTodas() {
    setReenvio("Reenviando todas las ventas…");
    const resultado = await sincronizar({ todas: true, sinEsperar: true });
    setReenvio(
      resultado === "al-dia"
        ? "Listo: se reenviaron todas. El servidor no duplica ninguna, revisalo en el panel."
        : resultado === "nada-para-subir"
          ? "Este celular todavía no tiene ventas."
          : "No se pudo reenviar ahora (sin señal o servidor caído). Probá en un rato.",
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="sticky top-0 z-10">
        <IndicadorDeCola />
      </div>
      <main className="flex flex-col gap-4 p-4">
        <h1 className="text-3xl font-black">Estilofit</h1>
        {datos === null ? (
          <p>Abriendo…</p>
        ) : !datos.sesion || datos.sesion.revocado ? (
          <Alta revocado={datos.sesion?.revocado ?? false} />
        ) : (
          <>
            <p className="text-lg">
              Celular: <span className="font-bold">{datos.sesion.dispositivoNombre}</span>
            </p>
            {listoSinConexion === false && (
              <Aviso tono="atencion">
                La app todavía no está guardada para abrir sin señal. Instalala (Agregar a pantalla de inicio), abrila una vez con señal y esperá
                a que este aviso desaparezca.
              </Aviso>
            )}
            {listoSinConexion && <Aviso tono="exito">La app abre sin señal.</Aviso>}

            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-black">Eventos en este celular</h2>
              {datos.eventos.length === 0 ? (
                <Vacio titulo="Todavía no bajaste ningún evento">Con señal, tocá “Ver eventos disponibles” y bajá el paquete del evento.</Vacio>
              ) : (
                datos.eventos.map((e) => (
                  <div key={e.id} className="flex flex-col gap-2 rounded-lg border-2 border-black p-4">
                    <p className="text-xl font-black">{e.nombre}</p>
                    <p>
                      {e.lugar} · {rangoDeFechas(e.fechaDesde, e.fechaHasta)}
                    </p>
                    <p className="font-bold text-green-800">
                      Paquete descargado el {momento(new Date(e.descargadoEn))}: {e.variantes} variantes. Listo para operar sin conexión.
                    </p>
                    {/* Navegación completa y no de cliente: sin señal, el pedido de datos de Next fallaría. */}
                    <a href={`/vender?evento=${e.id}`} className="flex min-h-14 items-center justify-center rounded-lg bg-black text-xl font-black text-white">
                      Vender
                    </a>
                    <QuitarEvento eventoId={e.id} />
                  </div>
                ))
              )}
            </section>

            <EventosDelServidor token={datos.sesion.token} bajados={new Set(datos.eventos.map((e) => e.id))} />

            {datos.rechazadas.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border-2 border-red-700 p-4">
                <h2 className="text-xl font-black text-red-800">Ventas rechazadas por el servidor</h2>
                <p>No se reintentan solas porque reintentar no las arregla. Avisá a quien maneja el panel con este detalle:</p>
                {datos.rechazadas.map((v) => (
                  <div key={v.clientUuid} className="border-t border-red-200 pt-2 text-sm">
                    <p className="font-bold">
                      {momento(new Date(v.creadaEn))} · {pesos(v.total)} · {v.items.map((i) => i.descripcion).join(", ")}
                    </p>
                    <p>{v.motivoRechazo}</p>
                  </div>
                ))}
              </section>
            )}

            <section className="flex flex-col gap-2 rounded-lg border-2 border-neutral-400 p-4">
              <h2 className="text-lg font-bold">Reenviar todas las ventas</h2>
              <p className="text-sm">Vuelve a mandar todas las ventas de este celular, también las ya subidas. El servidor no duplica ninguna.</p>
              <Boton variante="secundario" onClick={reenviarTodas}>
                Reenviar todas
              </Boton>
              {reenvio && <Aviso tono="info">{reenvio}</Aviso>}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
