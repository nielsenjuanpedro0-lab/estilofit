"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { salir } from "@/app/panel/acciones";
import { Buscador } from "@/app/panel/buscador";
import type { Seccion } from "@/app/panel/secciones";

type Grupo = { titulo: string | null; secciones: Seccion[] };
type Contadores = Record<NonNullable<Seccion["contador"]>, number>;

function activa(pathname: string, href: string) {
  return href === "/panel" ? pathname === "/panel" : pathname === href || pathname.startsWith(`${href}/`);
}

function BarraLateral({ grupos, contadores, alNavegar }: { grupos: Grupo[]; contadores: Contadores; alNavegar: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones" className="flex h-full flex-col gap-4 overflow-y-auto bg-neutral-950 px-3 py-4 text-white">
      <Link href="/panel" onClick={alNavegar} className="px-2 text-2xl font-black tracking-tight">
        ESTILO<span className="text-yellow-300">FIT</span>
      </Link>
      {grupos.map((g) => (
        <div key={g.titulo ?? "inicio"} className="flex flex-col gap-0.5">
          {g.titulo && <p className="px-2 pb-1 text-[11px] font-black tracking-widest text-neutral-400 uppercase">{g.titulo}</p>}
          {g.secciones.map((s) => {
            const marcada = activa(pathname, s.href);
            const contador = s.contador ? contadores[s.contador] : 0;
            return (
              <Link
                key={s.href}
                href={s.href}
                onClick={alNavegar}
                aria-current={marcada ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-3 font-bold ${marcada ? "bg-yellow-300 text-black" : "text-neutral-100 hover:bg-neutral-800"}`}
              >
                <span className="flex-1">{s.nombre}</span>
                {contador > 0 && (
                  <span className={`rounded-full px-2 text-xs font-black tabular-nums ${marcada ? "bg-black text-yellow-300" : "bg-yellow-300 text-black"}`}>
                    {contador}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
      <p className="mt-auto px-2 text-xs text-neutral-500">Stock y venta en eventos</p>
    </nav>
  );
}

function MenuDeUsuario({ nombre, rol }: { nombre: string; rol: string }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const cerrarAfuera = (e: MouseEvent) => {
      if (caja.current && e.target instanceof Node && !caja.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrarAfuera);
    return () => document.removeEventListener("mousedown", cerrarAfuera);
  }, []);
  const iniciales = nombre
    .split(" ")
    .map((p) => p.charAt(0))
    .slice(0, 2)
    .join("");
  return (
    <div ref={caja} className="relative">
      <button
        onClick={() => setAbierto(!abierto)}
        aria-expanded={abierto}
        className="flex min-h-11 items-center gap-2 rounded-lg border-2 border-transparent px-2 hover:border-black"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-black text-sm font-black text-yellow-300">{iniciales}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-sm font-black">{nombre}</span>
          <span className="block text-xs text-neutral-600">{rol}</span>
        </span>
        <span aria-hidden>▾</span>
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-xl border-2 border-black bg-white shadow-[4px_4px_0_0_#000]">
          <Link href="/panel/cuenta" onClick={() => setAbierto(false)} className="block px-4 py-3 font-bold hover:bg-yellow-50">
            Mi cuenta y clave
          </Link>
          <form action={salir} className="border-t border-neutral-300">
            <button className="w-full px-4 py-3 text-left font-bold text-red-700 hover:bg-red-50">Salir</button>
          </form>
        </div>
      )}
    </div>
  );
}

// El marco del panel: barra lateral fija en escritorio y desplegable en pantallas chicas,
// barra superior con el buscador y el usuario.
export function Escritorio({
  grupos,
  contadores,
  usuario,
  children,
}: {
  grupos: Grupo[];
  contadores: Contadores;
  usuario: { nombre: string; rol: string };
  children: ReactNode;
}) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  return (
    <div className="min-h-dvh bg-neutral-100 lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="hidden lg:sticky lg:top-0 lg:block lg:h-dvh">
        <BarraLateral grupos={grupos} contadores={contadores} alNavegar={() => undefined} />
      </aside>
      {menuAbierto && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div className="w-64">
            <BarraLateral grupos={grupos} contadores={contadores} alNavegar={() => setMenuAbierto(false)} />
          </div>
          <button aria-label="Cerrar menú" className="flex-1 bg-black/50" onClick={() => setMenuAbierto(false)} />
        </div>
      )}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b-2 border-black bg-white px-4 py-2">
          <button onClick={() => setMenuAbierto(true)} className="min-h-11 rounded-lg border-2 border-black px-3 font-bold lg:hidden" aria-label="Abrir menú">
            ☰ Menú
          </button>
          <Buscador grupos={grupos} />
          <div className="ml-auto">
            <MenuDeUsuario nombre={usuario.nombre} rol={usuario.rol} />
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
