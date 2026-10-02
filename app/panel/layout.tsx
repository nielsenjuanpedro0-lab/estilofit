import Link from "next/link";
import { salir } from "@/app/panel/acciones";

// Todo el panel lee la base en cada pedido. Sin esto, `next build` intenta prerenderizar y no hay DATABASE_URL.
export const dynamic = "force-dynamic";

const SECCIONES = [
  { href: "/panel", nombre: "Stock" },
  { href: "/panel/eventos", nombre: "Eventos" },
  { href: "/panel/catalogo", nombre: "Catálogo" },
  { href: "/panel/ubicaciones", nombre: "Ubicaciones" },
  { href: "/panel/dispositivos", nombre: "Dispositivos" },
  { href: "/panel/reportes", nombre: "Reportes" },
];

export default function LayoutPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b-2 border-black bg-white">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-2">
          <span className="mr-3 text-xl font-black">Estilofit</span>
          {SECCIONES.map((s) => (
            <Link key={s.href} href={s.href} className="flex min-h-12 items-center rounded-lg px-3 font-bold hover:bg-neutral-100">
              {s.nombre}
            </Link>
          ))}
          <form action={salir} className="ml-auto">
            <button className="min-h-12 rounded-lg px-3 font-bold underline">Salir</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
