"use client";

import { useState } from "react";
import { sincronizar, type ResultadoCola } from "@/celular/cola";
import { useEstadoDeCola, useSincronizacionAutomatica } from "@/celular/usar-cola";

const EXPLICACION: Record<ResultadoCola, string> = {
  // De eso se ocupa la pantalla de Inicio, con el formulario de alta.
  "sin-alta": "",
  revocado: "Este celular fue revocado. Las ventas quedan guardadas: dalo de alta de nuevo para subirlas.",
  "nada-para-subir": "",
  "al-dia": "",
  "sin-senal": "Sin señal: se suben solas cuando vuelva.",
  "servidor-con-problemas": "El servidor no respondió bien: se reintenta solo.",
};

// Siempre a la vista, nunca en un menú: el dueño necesita ver este número para quedarse tranquilo.
export function IndicadorDeCola() {
  const estado = useEstadoDeCola();
  const { ultimo, setUltimo } = useSincronizacionAutomatica();
  const [subiendo, setSubiendo] = useState(false);

  async function subirAhora() {
    setSubiendo(true);
    setUltimo(await sincronizar({ sinEsperar: true }).finally(() => setSubiendo(false)));
  }

  const pendientes = estado?.pendientes ?? null;
  const fondo = pendientes === null ? "bg-neutral-200" : pendientes === 0 ? "bg-green-700 text-white" : "bg-amber-400 text-black";
  const explicacion = ultimo ? EXPLICACION[ultimo] : "";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${fondo}`} role="status" aria-live="polite">
      <div className="flex-1 leading-tight">
        <p className="text-base font-black">
          {pendientes === null ? "Contando ventas…" : pendientes === 0 ? "Todas las ventas subidas" : `${pendientes} ${pendientes === 1 ? "venta pendiente" : "ventas pendientes"} de subir`}
        </p>
        {estado && estado.rechazadas > 0 && (
          <p className="text-sm font-bold text-red-800">{estado.rechazadas} rechazadas por el servidor: miralas en Inicio</p>
        )}
        {explicacion && <p className="text-sm">{explicacion}</p>}
      </div>
      {pendientes !== null && pendientes > 0 && (
        <button onClick={subirAhora} disabled={subiendo} className="min-h-12 rounded-lg border-2 border-black bg-white px-3 font-bold text-black disabled:opacity-50">
          {subiendo ? "Subiendo…" : "Subir ahora"}
        </button>
      )}
    </div>
  );
}
