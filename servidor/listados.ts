import { asc, desc, type AnyColumn, type SQL } from "drizzle-orm";

// Lo común de las tablas largas del panel (ventas, movimientos, auditoría): página, orden y
// dirección vienen en la URL. Lo que no está en la lista de columnas permitidas se ignora.

export const POR_PAGINA = 50;

export type ParametrosDeListado = Record<string, string | string[] | undefined>;

// Los valores repetidos en la URL (?a=1&a=2) llegan como lista: se toma el primero.
export function parametro(parametros: ParametrosDeListado, clave: string) {
  const valor = parametros[clave];
  return Array.isArray(valor) ? valor[0] : valor;
}

export function leerListado<Columnas extends Record<string, AnyColumn | SQL>>(
  parametros: ParametrosDeListado,
  columnas: Columnas,
  porDefecto: keyof Columnas & string,
): { pagina: number; desplazamiento: number; orden: SQL; campo: keyof Columnas & string; dir: "asc" | "desc" } {
  type Campo = keyof Columnas & string;
  const pedida = Number(parametro(parametros, "pagina"));
  const pagina = Number.isInteger(pedida) && pedida > 0 ? pedida : 1;
  const esCampo = (c: string | undefined): c is Campo => c !== undefined && Object.hasOwn(columnas, c);
  const campoPedido = parametro(parametros, "orden");
  const campo = esCampo(campoPedido) ? campoPedido : porDefecto;
  const dir = parametro(parametros, "dir") === "asc" ? "asc" : "desc";
  const columna = columnas[campo];
  if (!columna) throw new Error(`Columna de orden desconocida: ${campo}`);
  return { pagina, desplazamiento: (pagina - 1) * POR_PAGINA, orden: dir === "asc" ? asc(columna) : desc(columna), campo, dir };
}

// Los filtros por fecha del panel son días de Argentina: "2026-10-17" empieza a las 00:00 de acá.
export function diaArgentino(dia: string | undefined, sumarDias = 0) {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const fecha = new Date(`${dia}T00:00:00-03:00`);
  fecha.setUTCDate(fecha.getUTCDate() + sumarDias);
  return fecha;
}

// Los mismos filtros de la pantalla, para el enlace de exportar: "?evento=3&medio=efectivo" o "".
export function comoConsulta(parametros: Record<string, string | undefined>) {
  const busqueda = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) if (valor && clave !== "pagina") busqueda.set(clave, valor);
  const texto = busqueda.toString();
  return texto ? `?${texto}` : "";
}

// Los parámetros de la URL como texto plano, para armar los enlaces de orden y páginas.
export function parametrosPlanos(parametros: ParametrosDeListado) {
  return Object.fromEntries(Object.keys(parametros).map((clave) => [clave, parametro(parametros, clave)]));
}
