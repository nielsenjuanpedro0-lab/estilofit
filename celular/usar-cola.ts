"use client";

import { liveQuery } from "dexie";
import { useEffect, useState } from "react";
import { almacen } from "@/celular/almacen";
import { sincronizar, type ResultadoCola } from "@/celular/cola";

export type EstadoDeCola = { pendientes: number; rechazadas: number };

// Arranca en null y se llena en el efecto: el HTML que precachea el service worker se generó
// sin ventas, y si el primer render del cliente mostrara otro número React tiraría el árbol.
export function useEstadoDeCola() {
  const [estado, setEstado] = useState<EstadoDeCola | null>(null);
  useEffect(() => {
    const suscripcion = liveQuery(async () => ({
      pendientes: await almacen.ventas.where("estado").equals("pendiente").count(),
      rechazadas: await almacen.ventas.where("estado").equals("rechazada").count(),
    })).subscribe({
      next: setEstado,
      error: (error: unknown) => {
        throw error;
      },
    });
    return () => suscripcion.unsubscribe();
  }, []);
  return estado;
}

// La cola corre sola: al abrir, al volver la señal, al volver a la app y cada diez segundos
// (que solo sube lo que ya cumplió su espera de backoff).
export function useSincronizacionAutomatica() {
  const [ultimo, setUltimo] = useState<ResultadoCola | null>(null);
  useEffect(() => {
    const correr = (sinEsperar: boolean) => {
      void sincronizar({ sinEsperar }).then(setUltimo);
    };
    const alVolverLaSenal = () => correr(true);
    const alVolverALaApp = () => {
      if (document.visibilityState === "visible") correr(true);
    };
    correr(true);
    window.addEventListener("online", alVolverLaSenal);
    document.addEventListener("visibilitychange", alVolverALaApp);
    const reloj = window.setInterval(() => correr(false), 10_000);
    return () => {
      window.removeEventListener("online", alVolverLaSenal);
      document.removeEventListener("visibilitychange", alVolverALaApp);
      window.clearInterval(reloj);
    };
  }, []);
  return { ultimo, setUltimo };
}
