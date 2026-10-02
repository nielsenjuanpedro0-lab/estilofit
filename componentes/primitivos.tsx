"use client";

import { useActionState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

// Primitivos de interfaz escritos a mano. Contraste alto y objetivos táctiles de 48px como mínimo:
// se usa parado, apurado, al sol y a veces con frío.

const VARIANTES_BOTON = {
  primario: "bg-black text-white border-2 border-black active:bg-neutral-700",
  secundario: "bg-white text-black border-2 border-black active:bg-neutral-200",
  peligro: "bg-red-700 text-white border-2 border-red-700 active:bg-red-900",
};

export function Boton({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: keyof typeof VARIANTES_BOTON }) {
  return (
    <button
      className={`min-h-12 rounded-lg px-4 text-base font-bold select-none disabled:opacity-40 ${VARIANTES_BOTON[variante]} ${className}`}
      {...props}
    />
  );
}

// Se deshabilita mientras el formulario se envía: un doble toque no carga dos veces.
export function BotonEnviar({ children, variante, className }: { children: ReactNode; variante?: keyof typeof VARIANTES_BOTON; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Boton type="submit" variante={variante} className={className} disabled={pending}>
      {pending ? "Guardando…" : children}
    </Boton>
  );
}

export function Campo({ etiqueta, ...props }: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold">{etiqueta}</span>
      <input className="min-h-12 rounded-lg border-2 border-black bg-white px-3 text-base" {...props} />
    </label>
  );
}

export function Selector({
  etiqueta,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-bold">{etiqueta}</span>
      <select className="min-h-12 rounded-lg border-2 border-black bg-white px-3 text-base" {...props}>
        {children}
      </select>
    </label>
  );
}

const TONOS_AVISO = {
  error: "border-red-700 bg-red-50 text-red-900",
  exito: "border-green-800 bg-green-50 text-green-900",
  atencion: "border-amber-600 bg-amber-50 text-amber-950",
  info: "border-black bg-neutral-50 text-black",
};

export function Aviso({ tono, children }: { tono: keyof typeof TONOS_AVISO; children: ReactNode }) {
  return (
    <div role={tono === "error" ? "alert" : "status"} className={`rounded-lg border-2 p-3 text-base font-medium ${TONOS_AVISO[tono]}`}>
      {children}
    </div>
  );
}

// Un estado vacío dice qué hacer, no decora.
export function Vacio({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-neutral-500 p-6 text-center">
      <p className="text-lg font-bold">{titulo}</p>
      <div className="mt-2 text-base">{children}</div>
    </div>
  );
}

type Estado = { error?: string; exito?: string } | null;

// Un formulario que llama a una server action y muestra lo que respondió, debajo de los campos.
export function Formulario({
  accion,
  children,
  className = "flex flex-col gap-3",
}: {
  accion: (previo: Estado, formulario: FormData) => Promise<Estado>;
  children: ReactNode;
  className?: string;
}) {
  const [estado, enviar] = useActionState(accion, null);
  return (
    <form action={enviar} className={className}>
      {children}
      {estado?.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado?.exito && <Aviso tono="exito">{estado.exito}</Aviso>}
    </form>
  );
}
