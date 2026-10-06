"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { buscarAccion } from "@/app/panel/acciones-busqueda";
import type { Seccion } from "@/app/panel/secciones";
import type { Resultado } from "@/servidor/busqueda";

// Buscador global: Ctrl+K (o Cmd+K, o "/") desde cualquier pantalla del panel. Salta a secciones,
// productos, SKU, eventos, ventas y usuarios. Flechas para moverse, Enter para ir, Esc para cerrar.
export function Buscador({ grupos }: { grupos: { secciones: Seccion[] }[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [remotos, setRemotos] = useState<Resultado[]>([]);
  const [elegido, setElegido] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const ultimaBusqueda = useRef(0);

  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      const escribiendo = e.target instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName);
      if ((e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !escribiendo)) {
        e.preventDefault();
        setAbierto(true);
      }
    };
    window.addEventListener("keydown", atajo);
    return () => window.removeEventListener("keydown", atajo);
  }, []);

  // Espera a que se deje de tipear y descarta respuestas de búsquedas viejas.
  useEffect(() => {
    if (!abierto || texto.trim().length < 2) {
      setRemotos([]);
      return;
    }
    const numero = ++ultimaBusqueda.current;
    setBuscando(true);
    const espera = window.setTimeout(async () => {
      const encontrados = await buscarAccion(texto);
      if (numero !== ultimaBusqueda.current) return;
      setRemotos(encontrados);
      setBuscando(false);
    }, 200);
    return () => window.clearTimeout(espera);
  }, [texto, abierto]);

  const q = texto.trim().toLowerCase();
  const secciones: Resultado[] = grupos
    .flatMap((g) => g.secciones)
    .filter((s) => !q || `${s.nombre} ${s.descripcion}`.toLowerCase().includes(q))
    .map((s) => ({ tipo: "Sección", titulo: s.nombre, detalle: s.descripcion, href: s.href }));
  const resultados = [...secciones.slice(0, q ? 4 : 12), ...remotos];

  function cerrar() {
    setAbierto(false);
    setTexto("");
    setElegido(0);
  }

  function ir(r: Resultado | undefined) {
    if (!r) return;
    cerrar();
    router.push(r.href);
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="flex min-h-11 w-full max-w-md items-center gap-2 rounded-lg border-2 border-neutral-300 bg-neutral-50 px-3 text-left text-neutral-600 hover:border-black"
      >
        <span aria-hidden>⌕</span>
        <span className="flex-1 truncate">Buscar producto, SKU, evento, venta…</span>
        <kbd className="hidden rounded border border-neutral-400 bg-white px-1.5 text-xs font-bold sm:inline">Ctrl K</kbd>
      </button>
      {abierto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[10vh]" onClick={cerrar}>
          <div
            role="dialog"
            aria-label="Buscar"
            className="w-full max-w-2xl overflow-hidden rounded-xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000]"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                setElegido(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") cerrar();
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setElegido((i) => Math.min(resultados.length - 1, i + 1));
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setElegido((i) => Math.max(0, i - 1));
                }
                if (e.key === "Enter") ir(resultados[elegido]);
              }}
              placeholder="Escribí un producto, un SKU, un evento, un número de venta…"
              className="w-full border-b-2 border-black px-4 py-4 text-lg outline-none"
            />
            <ul className="max-h-[60vh] overflow-y-auto py-1" role="listbox">
              {resultados.map((r, i) => (
                <li key={`${r.tipo}-${r.href}-${r.titulo}`} role="option" aria-selected={i === elegido}>
                  <button
                    onMouseEnter={() => setElegido(i)}
                    onClick={() => ir(r)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left ${i === elegido ? "bg-yellow-300" : ""}`}
                  >
                    <span className="w-20 shrink-0 text-xs font-black text-neutral-600 uppercase">{r.tipo}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{r.titulo}</span>
                      <span className="block truncate text-sm text-neutral-700">{r.detalle}</span>
                    </span>
                  </button>
                </li>
              ))}
              {q.length >= 2 && !buscando && resultados.length === 0 && (
                <li className="px-4 py-6 text-center">No se encontró nada con “{texto}”. Probá con menos letras o con el SKU.</li>
              )}
              {buscando && <li className="px-4 py-2 text-sm text-neutral-600">Buscando…</li>}
            </ul>
            <p className="border-t border-neutral-300 px-4 py-2 text-xs text-neutral-600">↑ ↓ para moverte · Enter para ir · Esc para cerrar</p>
          </div>
        </div>
      )}
    </>
  );
}
