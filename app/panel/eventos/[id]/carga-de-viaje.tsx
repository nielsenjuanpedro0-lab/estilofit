"use client";

import { useMemo, useState, useTransition } from "react";
import { cargarViaje } from "@/app/panel/acciones";
import { Aviso, Boton, Campo, Selector } from "@/componentes/primitivos";

export type Disponible = {
  varianteId: number;
  producto: string;
  marca: string;
  categoria: string;
  talle: string;
  color: string;
  sku: string;
  disponible: number;
};

// Elegir qué viaja y cuánto. Se busca por nombre, categoría y talle, y la cantidad se carga
// tipeando o con los botones rápidos. Nada se mueve hasta confirmar.
export function CargaDeViaje({ eventoId, origenId, disponibles }: { eventoId: number; origenId: number; disponibles: Disponible[] }) {
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [talle, setTalle] = useState("");
  const [resultado, setResultado] = useState<{ tono: "error" | "exito"; mensaje: string } | null>(null);
  const [enviando, startTransition] = useTransition();

  const categorias = useMemo(() => [...new Set(disponibles.map((d) => d.categoria))].sort(), [disponibles]);
  const talles = useMemo(() => [...new Set(disponibles.map((d) => d.talle))], [disponibles]);
  const visibles = disponibles.filter((d) => {
    const buscado = texto.trim().toLowerCase();
    const coincideTexto = !buscado || `${d.producto} ${d.marca} ${d.sku} ${d.color}`.toLowerCase().includes(buscado);
    return coincideTexto && (!categoria || d.categoria === categoria) && (!talle || d.talle === talle);
  });

  const elegidas = Object.entries(cantidades)
    .map(([varianteId, cantidad]) => ({ varianteId: Number(varianteId), cantidad }))
    .filter((i) => i.cantidad > 0);
  const unidades = elegidas.reduce((suma, i) => suma + i.cantidad, 0);

  function fijar(varianteId: number, cantidad: number, maximo: number) {
    setResultado(null);
    setCantidades((previas) => ({ ...previas, [varianteId]: Math.max(0, Math.min(maximo, Math.floor(cantidad) || 0)) }));
  }

  function confirmar() {
    startTransition(async () => {
      const respuesta = await cargarViaje({ eventoId, origenId, items: elegidas });
      if (respuesta.ok) {
        setCantidades({});
        setResultado({ tono: "exito", mensaje: `Listo: se cargaron ${respuesta.unidades} unidades al evento.` });
      } else {
        setResultado({ tono: "error", mensaje: respuesta.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo etiqueta="Buscar" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, marca, color o SKU" />
        <Selector etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Selector>
        <Selector etiqueta="Talle" value={talle} onChange={(e) => setTalle(e.target.value)}>
          <option value="">Todos</option>
          {talles.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </Selector>
      </div>

      <div className="overflow-x-auto rounded-lg border-2 border-black">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-neutral-100">
            <tr>
              <th className="p-2">Producto</th>
              <th className="p-2">Talle</th>
              <th className="p-2">Color</th>
              <th className="p-2 text-right">Hay</th>
              <th className="p-2 text-center">Llevar</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((d) => {
              const cantidad = cantidades[d.varianteId] ?? 0;
              return (
                <tr key={d.varianteId} className={`border-t border-neutral-300 ${cantidad > 0 ? "bg-yellow-50" : ""}`}>
                  <td className="p-2">
                    <span className="font-bold">{d.producto}</span> <span className="font-mono text-neutral-600">{d.sku}</span>
                  </td>
                  <td className="p-2 font-bold">{d.talle}</td>
                  <td className="p-2">{d.color}</td>
                  <td className="p-2 text-right tabular-nums">{d.disponible}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-center gap-1">
                      <Boton variante="secundario" className="w-12 px-0" onClick={() => fijar(d.varianteId, cantidad - 1, d.disponible)} aria-label="Uno menos">
                        −
                      </Boton>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={d.disponible}
                        value={cantidad || ""}
                        placeholder="0"
                        onChange={(e) => fijar(d.varianteId, Number(e.target.value), d.disponible)}
                        className="min-h-12 w-16 rounded-lg border-2 border-black text-center text-base tabular-nums"
                        aria-label={`Cantidad de ${d.producto} ${d.talle}`}
                      />
                      <Boton variante="secundario" className="w-12 px-0" onClick={() => fijar(d.varianteId, cantidad + 1, d.disponible)} aria-label="Uno más">
                        +
                      </Boton>
                      <Boton variante="secundario" className="px-2 text-sm" onClick={() => fijar(d.varianteId, d.disponible, d.disponible)}>
                        Todo
                      </Boton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t-2 border-black bg-white py-3">
        <p className="text-lg font-bold">
          {elegidas.length} variantes · {unidades} unidades
        </p>
        <Boton className="ml-auto" disabled={elegidas.length === 0 || enviando} onClick={confirmar}>
          {enviando ? "Cargando…" : "Confirmar carga al evento"}
        </Boton>
      </div>
      {resultado && <Aviso tono={resultado.tono}>{resultado.mensaje}</Aviso>}
    </div>
  );
}
