"use client";

import Link from "next/link";
import { useActionState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";

// Primitivos de interfaz escritos a mano. Contraste alto y objetivos táctiles de 48px como mínimo:
// el celular se usa parado, apurado y al sol; el panel, en un escritorio de trabajo.

const VARIANTES_BOTON = {
  primario: "bg-black text-white border-2 border-black hover:bg-neutral-800 active:bg-neutral-700",
  secundario: "bg-white text-black border-2 border-black hover:bg-neutral-100 active:bg-neutral-200",
  peligro: "bg-red-700 text-white border-2 border-red-700 hover:bg-red-800 active:bg-red-900",
  destacado: "bg-yellow-300 text-black border-2 border-black hover:bg-yellow-400 active:bg-yellow-500",
};
type Variante = keyof typeof VARIANTES_BOTON;

export function Boton({ variante = "primario", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return (
    <button
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-base font-bold select-none disabled:opacity-40 ${VARIANTES_BOTON[variante]} ${className}`}
      {...props}
    />
  );
}

// Un enlace con aspecto de botón: para navegar, no para enviar.
export function EnlaceBoton({ href, variante = "secundario", className = "", children }: { href: string; variante?: Variante; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 font-bold ${VARIANTES_BOTON[variante]} ${className}`}>
      {children}
    </Link>
  );
}

// Se deshabilita mientras el formulario se envía: un doble toque no carga dos veces.
export function BotonEnviar({ children, variante, className }: { children: ReactNode; variante?: Variante; className?: string }) {
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

export function Selector({ etiqueta, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { etiqueta: string; children: ReactNode }) {
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
    <div className="rounded-lg border-2 border-dashed border-neutral-400 bg-white p-6 text-center">
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

// --- Escritorio de trabajo ---

export function EncabezadoDePagina({
  titulo,
  descripcion,
  migas = [],
  acciones,
}: {
  titulo: string;
  descripcion?: ReactNode;
  migas?: { href: string; nombre: string }[];
  acciones?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-4 border-b-2 border-black pb-4">
      <div className="min-w-0 flex-1">
        {migas.length > 0 && (
          <nav aria-label="Ubicación" className="mb-1 flex flex-wrap gap-1 text-sm text-neutral-600">
            {migas.map((m) => (
              <span key={m.href}>
                <Link href={m.href} className="underline hover:text-black">
                  {m.nombre}
                </Link>{" "}
                ›
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-3xl leading-tight font-black tracking-tight">{titulo}</h1>
        {descripcion && <div className="mt-1 max-w-3xl text-neutral-700">{descripcion}</div>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </header>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  children,
  className = "",
}: {
  titulo?: string;
  descripcion?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border-2 border-black bg-white ${className}`}>
      {(titulo || acciones) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-300 px-4 py-3">
          <div className="flex-1">
            {titulo && <h2 className="text-lg font-black">{titulo}</h2>}
            {descripcion && <p className="text-sm text-neutral-700">{descripcion}</p>}
          </div>
          {acciones}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONOS_INDICADOR = {
  neutro: "border-black bg-white",
  bueno: "border-green-800 bg-green-50",
  alerta: "border-amber-600 bg-amber-50",
  malo: "border-red-700 bg-red-50",
};

export function Indicador({
  titulo,
  valor,
  detalle,
  tono = "neutro",
  href,
}: {
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  tono?: keyof typeof TONOS_INDICADOR;
  href?: string;
}) {
  const contenido = (
    <>
      <p className="text-xs font-black tracking-wide text-neutral-700 uppercase">{titulo}</p>
      <p className="mt-1 text-3xl leading-none font-black tabular-nums">{valor}</p>
      {detalle && <p className="mt-2 text-sm text-neutral-700">{detalle}</p>}
    </>
  );
  const clase = `block rounded-xl border-2 p-4 ${TONOS_INDICADOR[tono]}`;
  return href ? (
    <Link href={href} className={`${clase} hover:shadow-[4px_4px_0_0_#000]`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

const TONOS_INSIGNIA = {
  neutro: "bg-neutral-200 text-black",
  bueno: "bg-green-700 text-white",
  alerta: "bg-amber-300 text-black",
  malo: "bg-red-700 text-white",
  info: "bg-sky-700 text-white",
  oscuro: "bg-black text-white",
};

export function Insignia({ tono = "neutro", children }: { tono?: keyof typeof TONOS_INSIGNIA; children: ReactNode }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-black whitespace-nowrap uppercase ${TONOS_INSIGNIA[tono]}`}>{children}</span>;
}

// Contenedor de tabla: desplaza a lo ancho sin que se mueva la página.
export function ContenedorTabla({ children }: { children: ReactNode }) {
  return <div className="max-w-full overflow-x-auto rounded-xl border-2 border-black bg-white">{children}</div>;
}

type Parametros = Record<string, string | undefined>;

function conParametros(ruta: string, parametros: Parametros, cambios: Parametros) {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries({ ...parametros, ...cambios })) if (valor) busqueda.set(clave, valor);
  const texto = busqueda.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}

// Encabezado de columna que ordena por la URL: así la tabla ordenada se puede compartir y recargar.
export function ColumnaOrdenable({
  campo,
  children,
  ruta,
  parametros,
  numero = false,
}: {
  campo: string;
  children: ReactNode;
  ruta: string;
  parametros: Parametros;
  numero?: boolean;
}) {
  const activa = parametros.orden === campo;
  const siguiente = activa && parametros.dir !== "asc" ? "asc" : "desc";
  return (
    <th className={numero ? "numero" : ""} aria-sort={activa ? (parametros.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={conParametros(ruta, parametros, { orden: campo, dir: siguiente, pagina: undefined })} className="inline-flex items-center gap-1 hover:underline">
        {children}
        <span aria-hidden className={activa ? "" : "text-neutral-400"}>
          {activa ? (parametros.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </Link>
    </th>
  );
}

export function Paginacion({
  ruta,
  parametros,
  pagina,
  porPagina,
  total,
}: {
  ruta: string;
  parametros: Parametros;
  pagina: number;
  porPagina: number;
  total: number;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  const hasta = Math.min(total, pagina * porPagina);
  const enlace = (p: number) => conParametros(ruta, parametros, { pagina: p === 1 ? undefined : String(p) });
  const clase = "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border-2 border-black px-3 font-bold";
  return (
    <nav aria-label="Páginas" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-auto text-neutral-700">
        {desde}–{hasta} de {total.toLocaleString("es-AR")}
      </span>
      {pagina > 1 ? (
        <Link href={enlace(pagina - 1)} className={clase}>
          ‹ Anterior
        </Link>
      ) : (
        <span className={`${clase} opacity-30`}>‹ Anterior</span>
      )}
      <span className="px-2 font-bold">
        Página {pagina} de {paginas}
      </span>
      {pagina < paginas ? (
        <Link href={enlace(pagina + 1)} className={clase}>
          Siguiente ›
        </Link>
      ) : (
        <span className={`${clase} opacity-30`}>Siguiente ›</span>
      )}
    </nav>
  );
}
