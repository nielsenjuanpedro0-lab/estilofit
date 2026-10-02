"use client";

import { useActionState } from "react";
import { crearDispositivoAccion } from "@/app/panel/acciones";
import { Aviso, BotonEnviar, Campo } from "@/componentes/primitivos";

export function AltaDeDispositivo() {
  const [estado, enviar] = useActionState(crearDispositivoAccion, null);
  return (
    <div className="flex flex-col gap-3">
      <form action={enviar} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo etiqueta="Nombre del celular" name="nombre" required placeholder="Ej: Celular de Juan" />
        <BotonEnviar>Generar código de alta</BotonEnviar>
      </form>
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado?.codigo && (
        <Aviso tono="exito">
          <p>En el celular, abrí la app, tocá “Dar de alta este celular” y escribí:</p>
          <p className="my-2 font-mono text-4xl font-black tracking-widest">{estado.codigo}</p>
          <p>Sirve una sola vez y vence en 15 minutos. No se puede volver a ver: si se pierde, generá otro.</p>
        </Aviso>
      )}
    </div>
  );
}
