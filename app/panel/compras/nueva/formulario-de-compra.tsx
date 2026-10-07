"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registrarCompraAccion } from "@/app/panel/acciones-compras";
import { pesos } from "@/componentes/formato";
import { Aviso, Boton, Campo, Selector } from "@/componentes/primitivos";

export type VarianteParaCompra = { varianteId: number; producto: string; marca: string; talle: string; color: string; sku: string; costo: number | null };
type Opcion = { id: number; nombre: string };
type Renglon = { varianteId: number; cantidad: number; costo: number };

// Más de 20% de diferencia con el último costo suele ser un error de tipeo: se avisa, no se bloquea.
const DIFERENCIA_PARA_AVISAR = 0.2;

export function FormularioDeCompra({
  variantes,
  proveedores,
  destinos,
  hoy,
  proveedorInicial,
}: {
  variantes: VarianteParaCompra[];
  proveedores: Opcion[];
  destinos: Opcion[];
  hoy: string;
  proveedorInicial: number | null;
}) {
  const router = useRouter();
  // Se genera una vez al abrir: si Guardar llega dos veces, el servidor devuelve la misma compra.
  const [clientUuid] = useState(() => crypto.randomUUID());
  const [proveedorId, setProveedorId] = useState(proveedorInicial ?? 0);
  const [ubicacionId, setUbicacionId] = useState(destinos[0]?.id ?? 0);
  const [fecha, setFecha] = useState(hoy);
  const [comprobante, setComprobante] = useState("");
  const [nota, setNota] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, startTransition] = useTransition();

  const porId = new Map(variantes.map((v) => [v.varianteId, v]));
  const elegidas = new Set(renglones.map((r) => r.varianteId));
  const buscado = texto.trim().toLowerCase();
  const sugerencias = buscado
    ? variantes.filter((v) => !elegidas.has(v.varianteId) && `${v.sku} ${v.producto} ${v.marca} ${v.talle} ${v.color}`.toLowerCase().includes(buscado)).slice(0, 8)
    : [];
  const unidades = renglones.reduce((s, r) => s + r.cantidad, 0);
  const total = renglones.reduce((s, r) => s + Math.round(r.costo * 100) * r.cantidad, 0) / 100;

  function agregar(v: VarianteParaCompra) {
    setRenglones((previos) => [...previos, { varianteId: v.varianteId, cantidad: 1, costo: v.costo ?? 0 }]);
    setTexto("");
    setError(null);
  }

  function cambiar(varianteId: number, cambios: Partial<Renglon>) {
    setRenglones((previos) => previos.map((r) => (r.varianteId === varianteId ? { ...r, ...cambios } : r)));
    setError(null);
  }

  function guardar() {
    startTransition(async () => {
      const r = await registrarCompraAccion({
        clientUuid,
        proveedorId,
        ubicacionId,
        fecha,
        comprobante,
        nota,
        items: renglones.map((x) => ({ varianteId: x.varianteId, cantidad: x.cantidad, costoUnitario: x.costo })),
      });
      if (r.ok) router.push(`/panel/compras/${r.compraId}`);
      else setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 rounded-xl border-2 border-black bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
        <Selector etiqueta="Proveedor" value={proveedorId} onChange={(e) => setProveedorId(Number(e.target.value))}>
          <option value={0} disabled>
            Elegí el proveedor
          </option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Selector etiqueta="Entra a" value={ubicacionId} onChange={(e) => setUbicacionId(Number(e.target.value))}>
          {destinos.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nombre}
            </option>
          ))}
        </Selector>
        <Campo etiqueta="Fecha del comprobante" type="date" max={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <Campo etiqueta="Comprobante (opcional)" value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="Ej: Remito 0001-00004567" />
        <div className="md:col-span-2 xl:col-span-4">
          <Campo etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
      </div>

      <div className="rounded-xl border-2 border-black bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <Campo etiqueta="Agregar producto" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="SKU, nombre, talle o color" />
          </div>
          <Link href="/panel/catalogo" target="_blank" className="pb-3 text-sm underline">
            ¿No está? Dar de alta en Catálogo
          </Link>
          <Boton variante="secundario" onClick={() => router.refresh()}>
            Actualizar lista
          </Boton>
        </div>
        {sugerencias.length > 0 && (
          <ul className="mt-2 divide-y rounded-lg border-2 border-black">
            {sugerencias.map((v) => (
              <li key={v.varianteId}>
                <button type="button" onClick={() => agregar(v)} className="flex w-full items-baseline gap-3 px-3 py-2 text-left hover:bg-yellow-100">
                  <span className="font-mono font-bold">{v.sku}</span>
                  <span className="font-bold">{v.producto}</span>
                  <span>
                    {v.talle} · {v.color}
                  </span>
                  <span className="ml-auto text-sm text-neutral-600">{v.costo !== null ? `último costo ${pesos(v.costo)}` : "sin costo"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {buscado && sugerencias.length === 0 && <p className="mt-2 text-sm text-neutral-600">No hay variantes activas con “{texto}”.</p>}
      </div>

      {renglones.length > 0 && (
        <div className="max-w-full overflow-x-auto rounded-xl border-2 border-black bg-white">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Talle</th>
                <th>Color</th>
                <th className="numero">Cantidad</th>
                <th className="numero">Costo unitario</th>
                <th className="numero">Subtotal</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {renglones.map((r) => {
                const v = porId.get(r.varianteId);
                const anterior = v?.costo ?? null;
                const avisar = anterior !== null && anterior > 0 && Math.abs(r.costo - anterior) / anterior > DIFERENCIA_PARA_AVISAR;
                return (
                  <tr key={r.varianteId}>
                    <td>
                      <span className="font-bold">{v?.producto}</span> <span className="font-mono text-neutral-600">{v?.sku}</span>
                    </td>
                    <td className="font-bold">{v?.talle}</td>
                    <td>{v?.color}</td>
                    <td className="numero">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={9999}
                        value={r.cantidad || ""}
                        onChange={(e) => cambiar(r.varianteId, { cantidad: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                        className="min-h-11 w-20 rounded-lg border-2 border-black text-center tabular-nums"
                        aria-label={`Cantidad de ${v?.producto} ${v?.talle}`}
                      />
                    </td>
                    <td className="numero">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={r.costo}
                        onChange={(e) => cambiar(r.varianteId, { costo: Math.max(0, Number(e.target.value) || 0) })}
                        className={`min-h-11 w-32 rounded-lg border-2 px-2 text-right tabular-nums ${avisar ? "border-amber-600 bg-amber-50" : "border-black"}`}
                        aria-label={`Costo de ${v?.producto} ${v?.talle}`}
                      />
                      {avisar && <p className="mt-1 text-xs font-bold text-amber-800">antes {pesos(anterior)}</p>}
                    </td>
                    <td className="numero font-bold">{pesos(r.costo * r.cantidad)}</td>
                    <td className="text-right">
                      <Boton variante="secundario" className="min-h-11 text-sm" onClick={() => setRenglones((p) => p.filter((x) => x.varianteId !== r.varianteId))}>
                        Quitar
                      </Boton>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t-2 border-black bg-white py-3">
        <p className="text-lg font-bold">
          {renglones.length} variantes · {unidades} unidades · {pesos(total)}
        </p>
        <Boton className="ml-auto" disabled={renglones.length === 0 || proveedorId === 0 || guardando} onClick={guardar}>
          {guardando ? "Guardando…" : "Guardar compra"}
        </Boton>
      </div>
      {error && <Aviso tono="error">{error}</Aviso>}
    </div>
  );
}
