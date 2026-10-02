"use client";

import { useMemo, useState, useTransition } from "react";
import { cerrarEventoAccion } from "@/app/panel/acciones";
import { Aviso, Boton, Selector } from "@/componentes/primitivos";
import type { ClaseDeFaltante } from "@/servidor/cierre";

export type FilaDeCierre = {
  varianteId: number;
  producto: string;
  categoria: string;
  talle: string;
  color: string;
  sku: string;
  salieron: number;
  vendidas: number;
  esperadas: number;
};

type Estado = "sin-contar" | "cuadra" | "faltan" | "sobran";

function estadoDe(esperadas: number, contadas: number | undefined): Estado {
  if (contadas === undefined) return "sin-contar";
  if (contadas === esperadas) return "cuadra";
  return contadas < esperadas ? "faltan" : "sobran";
}

const ESTILO_FILA: Record<Estado, string> = {
  "sin-contar": "",
  cuadra: "bg-green-50",
  faltan: "bg-red-50",
  sobran: "bg-sky-50",
};

function Diferencia({ esperadas, contadas }: { esperadas: number; contadas: number | undefined }) {
  const estado = estadoDe(esperadas, contadas);
  if (contadas === undefined) return <span className="text-neutral-400">—</span>;
  if (estado === "cuadra") return <span className="rounded bg-green-700 px-2 py-1 text-sm font-black text-white">Cuadra</span>;
  const diferencia = contadas - esperadas;
  return (
    <span className={`rounded px-2 py-1 text-sm font-black text-white ${estado === "faltan" ? "bg-red-700" : "bg-sky-700"}`}>
      {estado === "faltan" ? `Faltan ${-diferencia}` : `Sobran ${diferencia}`}
    </span>
  );
}

export function ConteoDeCierre({
  eventoId,
  filas,
  destinos,
}: {
  eventoId: number;
  filas: FilaDeCierre[];
  destinos: { id: number; nombre: string }[];
}) {
  const [contadas, setContadas] = useState<Record<number, number>>({});
  const [clase, setClase] = useState<Record<number, ClaseDeFaltante>>({});
  const [destinoId, setDestinoId] = useState(destinos[0]?.id ?? 0);
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();

  const totales = useMemo(() => {
    let contadasTotal = 0;
    let faltan = 0;
    let sobran = 0;
    let cuentas = 0;
    for (const f of filas) {
      const c = contadas[f.varianteId];
      if (c === undefined) continue;
      cuentas += 1;
      contadasTotal += c;
      if (c < f.esperadas) faltan += f.esperadas - c;
      if (c > f.esperadas) sobran += c - f.esperadas;
    }
    return { contadasTotal, faltan, sobran, cuentas };
  }, [filas, contadas]);

  const completo = totales.cuentas === filas.length;
  const conDiferencia = filas.filter((f) => {
    const c = contadas[f.varianteId];
    return c !== undefined && c !== f.esperadas;
  }).length;
  const visibles = soloDiferencias ? filas.filter((f) => estadoDe(f.esperadas, contadas[f.varianteId]) !== "cuadra") : filas;
  const destino = destinos.find((d) => d.id === destinoId)?.nombre ?? "";

  function fijar(varianteId: number, valor: string) {
    setConfirmando(false);
    setError(null);
    setContadas((previas) => {
      const siguiente = { ...previas };
      if (valor === "") delete siguiente[varianteId];
      else siguiente[varianteId] = Math.max(0, Math.floor(Number(valor)) || 0);
      return siguiente;
    });
  }

  function confirmar() {
    startTransition(async () => {
      const respuesta = await cerrarEventoAccion({
        eventoId,
        destinoId,
        conteo: filas.map((f) => ({ varianteId: f.varianteId, contadas: contadas[f.varianteId] ?? 0, faltanteEs: clase[f.varianteId] })),
      });
      setConfirmando(false);
      if (respuesta) setError(respuesta.error);
    });
  }

  let categoriaAnterior = "";

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Cifra titulo="Salieron" valor={filas.reduce((s, f) => s + f.salieron, 0)} />
        <Cifra titulo="Vendidas" valor={filas.reduce((s, f) => s + f.vendidas, 0)} />
        <Cifra titulo="Tienen que volver" valor={filas.reduce((s, f) => s + Math.max(0, f.esperadas), 0)} />
        <Cifra titulo="Contadas" valor={totales.contadasTotal} detalle={`${totales.cuentas} de ${filas.length} variantes`} />
        <Cifra
          titulo="Diferencia"
          valor={totales.faltan === 0 && totales.sobran === 0 ? "0" : [totales.faltan && `−${totales.faltan}`, totales.sobran && `+${totales.sobran}`].filter(Boolean).join(" / ")}
          detalle={conDiferencia > 0 ? `en ${conDiferencia} variantes` : "Todo cuadra hasta ahora"}
          tono={totales.faltan > 0 ? "rojo" : totales.sobran > 0 ? "azul" : "neutro"}
        />
      </dl>

      <label className="flex min-h-12 items-center gap-3 font-bold">
        <input type="checkbox" checked={soloDiferencias} onChange={(e) => setSoloDiferencias(e.target.checked)} className="size-6" />
        Mostrar solo lo que no cuadra o falta contar
      </label>

      <div className="overflow-x-auto rounded-lg border-2 border-black">
        <table className="w-full border-collapse text-left">
          <thead className="bg-black text-white">
            <tr>
              <th className="p-2">Producto</th>
              <th className="p-2 text-right">Salieron</th>
              <th className="p-2 text-right">Vendidas</th>
              <th className="p-2 text-right">Esperadas</th>
              <th className="p-2 text-center">Volvieron</th>
              <th className="p-2">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const c = contadas[f.varianteId];
              const estado = estadoDe(f.esperadas, c);
              const cabecera = f.categoria !== categoriaAnterior;
              categoriaAnterior = f.categoria;
              return [
                cabecera && (
                  <tr key={`c-${f.categoria}`} className="bg-neutral-200">
                    <td colSpan={6} className="px-2 py-1 text-sm font-black uppercase">
                      {f.categoria}
                    </td>
                  </tr>
                ),
                <tr key={f.varianteId} className={`border-t border-neutral-300 align-middle ${ESTILO_FILA[estado]}`}>
                  <td className="p-2">
                    <span className="font-bold">{f.producto}</span>
                    <span className="ml-2 text-lg font-black">{f.talle}</span>
                    <span className="ml-2 text-neutral-700">{f.color}</span>
                    <span className="ml-2 font-mono text-sm text-neutral-600">{f.sku}</span>
                  </td>
                  <td className="p-2 text-right tabular-nums">{f.salieron}</td>
                  <td className="p-2 text-right tabular-nums">{f.vendidas}</td>
                  <td className={`p-2 text-right text-lg font-black tabular-nums ${f.esperadas < 0 ? "text-red-700" : ""}`}>
                    {f.esperadas}
                    {f.esperadas < 0 && <span className="block text-xs font-bold">sobreventa</span>}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={c ?? ""}
                        onChange={(e) => fijar(f.varianteId, e.target.value)}
                        aria-label={`Volvieron de ${f.producto} ${f.talle} ${f.color}`}
                        className="min-h-12 w-20 rounded-lg border-2 border-black text-center text-xl font-black tabular-nums"
                      />
                      <button
                        onClick={() => fijar(f.varianteId, String(Math.max(0, f.esperadas)))}
                        className="min-h-12 rounded-lg border-2 border-black px-2 text-sm font-bold whitespace-nowrap"
                        title="Volvió exactamente lo esperado"
                      >
                        = {Math.max(0, f.esperadas)}
                      </button>
                    </div>
                  </td>
                  <td className="p-2">
                    <div className="flex flex-col items-start gap-1">
                      <Diferencia esperadas={f.esperadas} contadas={c} />
                      {estado === "faltan" && (
                        <div className="flex overflow-hidden rounded-lg border-2 border-black text-sm font-bold" role="radiogroup" aria-label="Qué pasó con lo que falta">
                          {(["faltante", "venta_no_registrada"] as const).map((opcion) => {
                            const elegida = (clase[f.varianteId] ?? "faltante") === opcion;
                            return (
                              <button
                                key={opcion}
                                role="radio"
                                aria-checked={elegida}
                                onClick={() => setClase({ ...clase, [f.varianteId]: opcion })}
                                className={`min-h-10 px-2 ${elegida ? "bg-black text-white" : "bg-white"}`}
                              >
                                {opcion === "faltante" ? "Faltante real" : "Venta no registrada"}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-col gap-3 border-t-4 border-black bg-white py-4">
        <div className="flex flex-wrap items-end gap-3">
          <Selector etiqueta="El remanente vuelve a" value={destinoId} onChange={(e) => setDestinoId(Number(e.target.value))}>
            {destinos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nombre}
              </option>
            ))}
          </Selector>
          <p className="flex-1 text-lg">
            {completo ? (
              <>
                Vuelven <span className="font-black">{totales.contadasTotal}</span> unidades a <span className="font-black">{destino}</span>
                {conDiferencia > 0 ? (
                  <>
                    {" "}
                    y {conDiferencia === 1 ? "queda asentada" : "quedan asentadas"} <span className="font-black">{conDiferencia}</span>{" "}
                    {conDiferencia === 1 ? "diferencia" : "diferencias"}.
                  </>
                ) : (
                  ". Todo cuadra."
                )}
              </>
            ) : (
              <>
                Faltan contar <span className="font-black">{filas.length - totales.cuentas}</span> variantes. Si no volvió nada de una, cargá 0.
              </>
            )}
          </p>
          {!confirmando ? (
            <Boton disabled={!completo || enviando} onClick={() => setConfirmando(true)} className="min-h-14 text-lg">
              Cerrar evento
            </Boton>
          ) : (
            <div className="flex gap-2">
              <Boton variante="secundario" onClick={() => setConfirmando(false)} disabled={enviando}>
                Volver
              </Boton>
              <Boton variante="peligro" onClick={confirmar} disabled={enviando} className="min-h-14 text-lg">
                {enviando ? "Cerrando…" : "Sí, cerrar. No se puede deshacer"}
              </Boton>
            </div>
          )}
        </div>
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    </div>
  );
}

function Cifra({ titulo, valor, detalle, tono = "neutro" }: { titulo: string; valor: string | number; detalle?: string; tono?: "neutro" | "rojo" | "azul" }) {
  const color = { neutro: "border-black", rojo: "border-red-700 bg-red-50 text-red-900", azul: "border-sky-700 bg-sky-50 text-sky-900" }[tono];
  return (
    <div className={`rounded-lg border-2 p-3 ${color}`}>
      <dt className="text-sm font-bold">{titulo}</dt>
      <dd className="text-3xl font-black tabular-nums">{valor}</dd>
      {detalle && <dd className="text-sm">{detalle}</dd>}
    </div>
  );
}
