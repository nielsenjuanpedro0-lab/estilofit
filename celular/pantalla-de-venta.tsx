"use client";

import { liveQuery } from "dexie";
import { useEffect, useMemo, useState } from "react";
import { almacen, type EventoBajado, type VentaLocal } from "@/celular/almacen";
import { IndicadorDeCola } from "@/celular/indicador-de-cola";
import { armarGrilla, type ProductoEnGrilla, type VarianteEnGrilla } from "@/celular/inventario";
import { guardarVenta } from "@/celular/venta";
import { pesos } from "@/componentes/formato";

// Todo lo de esta pantalla escribe en el celular. Cero llamadas de red durante la venta:
// la cola sube después, cuando haya señal.

type Linea = { varianteId: number; cantidad: number };
type Medio = VentaLocal["medioPago"];
const MEDIOS: { medio: Medio; nombre: string }[] = [
  { medio: "efectivo", nombre: "Efectivo" },
  { medio: "transferencia", nombre: "Transferencia" },
  { medio: "tarjeta", nombre: "Tarjeta" },
];

// En un evento ruidoso no se mira la pantalla: cada agregado vibra y suena.
let audio: AudioContext | null = null;
function avisarAgregado(frecuencia = 880, duracion = 0.09) {
  navigator.vibrate?.(40);
  audio ??= new AudioContext();
  const ahora = audio.currentTime;
  const oscilador = audio.createOscillator();
  const volumen = audio.createGain();
  oscilador.frequency.value = frecuencia;
  volumen.gain.setValueAtTime(0.25, ahora);
  volumen.gain.exponentialRampToValueAtTime(0.001, ahora + duracion);
  oscilador.connect(volumen).connect(audio.destination);
  oscilador.start(ahora);
  oscilador.stop(ahora + duracion);
}

function useDatosDelEvento(eventoId: number | null) {
  const [datos, setDatos] = useState<{ evento: EventoBajado | null; grilla: ProductoEnGrilla[]; carrito: Linea[] } | null>(null);
  useEffect(() => {
    if (eventoId === null) return;
    const suscripcion = liveQuery(async () => {
      const evento = (await almacen.eventos.get(eventoId)) ?? null;
      if (!evento) return { evento, grilla: [], carrito: [] };
      const variantes = await almacen.variantes.where("eventoId").equals(eventoId).toArray();
      const ventas = await almacen.ventas.where("[eventoId+estado]").between([eventoId, ""], [eventoId, "￿"]).toArray();
      const carrito = (await almacen.carritos.get(eventoId))?.items ?? [];
      return { evento, grilla: armarGrilla(evento, variantes, ventas), carrito };
    }).subscribe({
      next: setDatos,
      error: (error: unknown) => {
        throw error;
      },
    });
    return () => suscripcion.unsubscribe();
  }, [eventoId]);
  return datos;
}

function Imagen({ imagen, nombre }: { imagen: Blob | null; nombre: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!imagen) return;
    const creada = URL.createObjectURL(imagen);
    setUrl(creada);
    return () => URL.revokeObjectURL(creada);
  }, [imagen]);
  if (!url) return <div className="flex aspect-square items-center justify-center bg-neutral-100 p-2 text-center text-sm font-bold">{nombre}</div>;
  // eslint-disable-next-line @next/next/no-img-element -- es un blob local: next/image no lo puede optimizar.
  return <img src={url} alt="" className="aspect-square w-full object-contain" />;
}

function claseStock(stock: number) {
  if (stock < 0) return "text-red-700 font-black";
  if (stock === 0) return "text-red-700 font-bold";
  return "text-neutral-700";
}

export function PantallaDeVenta() {
  const [eventoId, setEventoId] = useState<number | null>(null);
  // El evento va en la query y no en la ruta: así es una sola página que el service worker precachea.
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get("evento"));
    setEventoId(Number.isInteger(id) && id > 0 ? id : 0);
  }, []);
  const datos = useDatosDelEvento(eventoId);

  const [abierto, setAbierto] = useState<ProductoEnGrilla | null>(null);
  const [sku, setSku] = useState("");
  const [verCarrito, setVerCarrito] = useState(false);
  const [cobro, setCobro] = useState<{ medio: Medio; cobrado: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const variantes = useMemo(() => {
    const porId = new Map<number, { producto: ProductoEnGrilla; variante: VarianteEnGrilla }>();
    for (const producto of datos?.grilla ?? []) for (const variante of producto.variantes) porId.set(variante.varianteId, { producto, variante });
    return porId;
  }, [datos?.grilla]);

  if (eventoId === null || datos === null) return <p className="p-6 text-xl">Abriendo…</p>;
  if (!datos.evento) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <p className="text-2xl font-black">Este evento no está bajado en el celular</p>
        <p className="text-lg">Volvé a Inicio y, con señal, bajá el paquete del evento.</p>
        <a href="/celular" className="flex min-h-14 items-center justify-center rounded-lg bg-black text-xl font-black text-white">
          Ir a Inicio
        </a>
      </div>
    );
  }
  const evento = datos.evento;
  const carrito = datos.carrito;

  const lineas = carrito.flatMap((l) => {
    const encontrada = variantes.get(l.varianteId);
    return encontrada ? [{ ...l, ...encontrada }] : [];
  });
  const total = lineas.reduce((suma, l) => suma + l.variante.precio * l.cantidad, 0);
  const unidades = lineas.reduce((suma, l) => suma + l.cantidad, 0);

  async function guardarCarrito(items: Linea[]) {
    await almacen.carritos.put({ eventoId: evento.id, items: items.filter((i) => i.cantidad > 0) });
  }

  async function agregar(varianteId: number) {
    avisarAgregado();
    const previa = carrito.find((l) => l.varianteId === varianteId);
    await guardarCarrito(
      previa ? carrito.map((l) => (l.varianteId === varianteId ? { ...l, cantidad: l.cantidad + 1 } : l)) : [...carrito, { varianteId, cantidad: 1 }],
    );
    setAbierto(null);
    setSku("");
  }

  async function confirmar() {
    if (!cobro) return;
    const cobrado = cobro.medio === "efectivo" ? Number(cobro.cobrado) : total;
    if (!Number.isFinite(cobrado) || cobrado < 0) return setAviso("El monto cobrado tiene que ser un número de pesos, sin puntos.");
    setGuardando(true);
    await guardarVenta({
      eventoId: evento.id,
      medioPago: cobro.medio,
      total: cobrado,
      items: lineas.map((l) => ({
        varianteId: l.varianteId,
        cantidad: l.cantidad,
        precio: l.variante.precio,
        descripcion: `${l.producto.nombre} ${l.variante.talle}${l.producto.variantes.some((v) => v.color !== l.variante.color) ? ` ${l.variante.color}` : ""}`,
      })),
    }).finally(() => setGuardando(false));
    avisarAgregado(523, 0.25);
    setCobro(null);
    setVerCarrito(false);
    setAviso(`Venta guardada: ${pesos(cobrado)} en ${cobro.medio}.`);
    window.setTimeout(() => setAviso(null), 3000);
  }

  const buscado = sku.trim();
  const exacta = buscado.length >= 3 ? [...variantes.values()].find((x) => x.variante.sku === buscado) : undefined;
  const grilla = buscado ? datos.grilla.filter((p) => p.variantes.some((v) => v.sku.startsWith(buscado))) : datos.grilla;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md touch-manipulation flex-col select-none">
      <header className="sticky top-0 z-20 bg-white">
        <div className="flex items-center gap-2 border-b-2 border-black px-3 py-2">
          <a href="/celular" className="flex min-h-12 items-center rounded-lg border-2 border-black px-3 font-bold">
            Inicio
          </a>
          <p className="flex-1 truncate text-lg font-black">{evento.nombre}</p>
          {evento.otrosDispositivos > 0 && (
            <span className="rounded bg-amber-300 px-2 py-1 text-xs font-black uppercase" title="Hay otros celulares vendiendo en este evento">
              Stock estimado
            </span>
          )}
        </div>
        <IndicadorDeCola />
        <div className="flex gap-2 border-b-2 border-black p-2">
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="SKU"
            aria-label="Buscar por SKU"
            className="min-h-12 w-full rounded-lg border-2 border-black px-3 text-2xl font-bold tabular-nums"
          />
          {sku && (
            <button onClick={() => setSku("")} className="min-h-12 rounded-lg border-2 border-black px-3 font-bold">
              Borrar
            </button>
          )}
        </div>
        {exacta && (
          <button
            onClick={() => agregar(exacta.variante.varianteId)}
            className="w-full bg-yellow-300 px-3 py-3 text-left text-lg font-black active:bg-yellow-400"
          >
            + Agregar {exacta.producto.nombre} · {exacta.variante.talle} {exacta.variante.color} · {pesos(exacta.variante.precio)}
          </button>
        )}
      </header>

      <main className={`grid grid-cols-2 gap-2 p-2 ${lineas.length > 0 ? "pb-44" : "pb-6"}`}>
        {grilla.length === 0 && (
          <p className="col-span-2 p-4 text-center text-lg">{buscado ? `Ningún SKU empieza con ${buscado}. Borrá y buscá en la grilla.` : "El paquete no trae productos. Volvé a Inicio y actualizalo."}</p>
        )}
        {grilla.map((p) => (
          <button key={p.productoId} onClick={() => setAbierto(p)} className="flex flex-col overflow-hidden rounded-lg border-2 border-black text-left active:bg-neutral-100">
            <Imagen imagen={p.imagen} nombre={p.nombre} />
            <div className="p-2">
              <p className="line-clamp-2 text-base leading-tight font-bold">{p.nombre}</p>
              <p className="text-lg font-black">{pesos(p.precio)}</p>
              <p className={`text-sm ${claseStock(p.stock)}`}>Quedan {p.stock}</p>
            </div>
          </button>
        ))}
      </main>

      {abierto && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={() => setAbierto(null)}>
          <div className="mx-auto w-full max-w-md rounded-t-2xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start gap-2">
              <div className="flex-1">
                <p className="text-2xl font-black">{abierto.nombre}</p>
                <p className="text-lg">
                  {abierto.marca} · {pesos(abierto.precio)}
                </p>
              </div>
              <button onClick={() => setAbierto(null)} className="min-h-12 rounded-lg border-2 border-black px-4 font-bold">
                Cerrar
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {abierto.variantes.map((v) => (
                <button
                  key={v.varianteId}
                  onClick={() => agregar(v.varianteId)}
                  className="flex min-h-20 flex-col items-center justify-center rounded-lg border-2 border-black bg-white p-1 active:bg-yellow-300"
                >
                  <span className="text-2xl leading-none font-black">{v.talle}</span>
                  {abierto.variantes.some((o) => o.color !== v.color) && <span className="text-sm font-bold">{v.color}</span>}
                  <span className={`text-sm ${claseStock(v.stock)}`}>Quedan {v.stock}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {lineas.length > 0 && !cobro && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t-2 border-black bg-white p-2">
          {verCarrito && (
            <button
              onClick={() => {
                void guardarCarrito([]);
                setVerCarrito(false);
              }}
              className="mb-2 min-h-12 w-full rounded-lg border-2 border-red-700 font-bold text-red-700"
            >
              Vaciar carrito
            </button>
          )}
          {verCarrito && (
            <ul className="mb-2 max-h-64 overflow-y-auto">
              {lineas.map((l) => (
                <li key={l.varianteId} className="flex items-center gap-2 border-b border-neutral-300 py-1">
                  <span className="flex-1 font-bold">
                    {l.producto.nombre} · {l.variante.talle}
                  </span>
                  <button
                    onClick={() => guardarCarrito(carrito.map((c) => (c.varianteId === l.varianteId ? { ...c, cantidad: c.cantidad - 1 } : c)))}
                    className="min-h-12 w-12 rounded-lg border-2 border-black text-xl font-black"
                    aria-label="Uno menos"
                  >
                    −
                  </button>
                  <span className="w-6 text-center text-lg font-black">{l.cantidad}</span>
                  <button
                    onClick={() => agregar(l.varianteId)}
                    className="min-h-12 w-12 rounded-lg border-2 border-black text-xl font-black"
                    aria-label="Uno más"
                  >
                    +
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => setVerCarrito(!verCarrito)} className="mb-2 flex min-h-12 w-full items-center justify-between px-1">
            <span className="text-lg font-bold underline">
              {unidades} {unidades === 1 ? "producto" : "productos"} {verCarrito ? "▲" : "▼"}
            </span>
            <span className="text-3xl font-black">{pesos(total)}</span>
          </button>
          <div className="grid grid-cols-3 gap-2">
            {MEDIOS.map(({ medio, nombre }) => (
              <button
                key={medio}
                onClick={() => setCobro({ medio, cobrado: String(total) })}
                className="min-h-16 rounded-lg bg-black text-base font-black text-white active:bg-neutral-700"
              >
                {nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      {cobro && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end bg-black/50">
          <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-2xl bg-white p-4">
            <p className="text-lg">
              Cobrar en <span className="font-black">{MEDIOS.find((m) => m.medio === cobro.medio)?.nombre}</span>
            </p>
            <p className="text-5xl font-black">{pesos(total)}</p>
            {cobro.medio === "efectivo" && (
              <label className="flex flex-col gap-1">
                <span className="text-sm font-bold">Cobrado en mano (si redondeaste, cambialo)</span>
                <input
                  value={cobro.cobrado}
                  onChange={(e) => setCobro({ ...cobro, cobrado: e.target.value.replace(/\D/g, "") })}
                  inputMode="numeric"
                  className="min-h-14 rounded-lg border-2 border-black px-3 text-3xl font-black tabular-nums"
                />
              </label>
            )}
            <button onClick={confirmar} disabled={guardando} className="min-h-20 rounded-lg bg-green-700 text-2xl font-black text-white active:bg-green-900 disabled:opacity-50">
              {guardando ? "Guardando…" : "Confirmar venta"}
            </button>
            <button onClick={() => setCobro(null)} className="min-h-12 rounded-lg border-2 border-black font-bold">
              Volver al carrito
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md bg-green-700 p-4 text-center text-xl font-black text-white" role="status">
          {aviso}
        </div>
      )}
    </div>
  );
}
