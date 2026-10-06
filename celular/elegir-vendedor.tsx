"use client";

import { useState } from "react";
import type { Vendedor } from "@/celular/almacen";
import { empezarTurno } from "@/celular/vendedor";

// Antes de vender, quien tiene el celular elige su nombre y pone su PIN. Funciona sin señal.
// Teclado propio y grande: con el teclado del sistema se tapa media pantalla y se erra el dedo.
export function ElegirVendedor({ vendedores, evento }: { vendedores: Vendedor[]; evento: string }) {
  const [elegido, setElegido] = useState<Vendedor | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificando, setVerificando] = useState(false);

  async function tocar(digito: string) {
    if (!elegido || verificando) return;
    setError(null);
    const nuevo = `${pin}${digito}`.slice(0, 4);
    setPin(nuevo);
    if (nuevo.length < 4) return;
    setVerificando(true);
    const ok = await empezarTurno(elegido, nuevo).finally(() => setVerificando(false));
    if (!ok) {
      navigator.vibrate?.([80, 60, 80]);
      setError("PIN incorrecto. Probá de nuevo; si no te lo acordás, pedíselo a un encargado.");
      setPin("");
    }
  }

  if (!elegido) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
        <div>
          <p className="text-sm font-bold text-neutral-600">{evento}</p>
          <h1 className="text-3xl font-black">¿Quién vende?</h1>
          <p>Cada venta queda a tu nombre.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {vendedores.map((v) => (
            <button
              key={v.id}
              onClick={() => setElegido(v)}
              className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-black bg-white p-3 text-lg font-black active:bg-yellow-300"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-black text-yellow-300">
                {v.nombre
                  .split(" ")
                  .map((p) => p.charAt(0))
                  .slice(0, 2)
                  .join("")}
              </span>
              {v.nombre}
            </button>
          ))}
        </div>
        <a href="/celular" className="mt-auto flex min-h-12 items-center justify-center rounded-lg border-2 border-black font-bold">
          Volver a Inicio
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md touch-manipulation flex-col gap-4 p-4 select-none">
      <button onClick={() => { setElegido(null); setPin(""); setError(null); }} className="min-h-12 self-start rounded-lg border-2 border-black px-3 font-bold">
        ← No soy {elegido.nombre.split(" ")[0]}
      </button>
      <div className="text-center">
        <h1 className="text-2xl font-black">Hola, {elegido.nombre.split(" ")[0]}</h1>
        <p>Poné tu PIN de 4 números</p>
      </div>
      <div className="flex justify-center gap-4" aria-label={`${pin.length} de 4 números`}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`size-5 rounded-full border-2 border-black ${i < pin.length ? "bg-black" : ""}`} />
        ))}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border-2 border-red-700 bg-red-50 p-3 text-center font-bold text-red-900">
          {error}
        </p>
      )}
      <div className="mt-auto grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} onClick={() => tocar(d)} className="min-h-20 rounded-xl border-2 border-black bg-white text-3xl font-black active:bg-yellow-300">
            {d}
          </button>
        ))}
        <button onClick={() => setPin(pin.slice(0, -1))} className="min-h-20 rounded-xl border-2 border-black bg-neutral-100 text-lg font-bold" aria-label="Borrar">
          Borrar
        </button>
        <button onClick={() => tocar("0")} className="min-h-20 rounded-xl border-2 border-black bg-white text-3xl font-black active:bg-yellow-300">
          0
        </button>
        <span />
      </div>
      {verificando && <p className="text-center font-bold">Verificando…</p>}
    </div>
  );
}
