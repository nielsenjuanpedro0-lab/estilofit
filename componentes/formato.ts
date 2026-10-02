// Formatos de pantalla. Un solo cliente, pesos argentinos, es-AR.

const formatoPesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
export const pesos = (valor: number) => formatoPesos.format(valor);

const formatoDia = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: "UTC" });
const formatoAnio = new Intl.DateTimeFormat("es-AR", { year: "numeric", timeZone: "UTC" });

// Las fechas de evento son columnas date ("2026-10-17"): se formatean en UTC para que no corran un día.
export function rangoDeFechas(desde: string, hasta: string) {
  const d = new Date(`${desde}T00:00:00Z`);
  const h = new Date(`${hasta}T00:00:00Z`);
  const anio = formatoAnio.format(h);
  return desde === hasta ? `${formatoDia.format(d)} ${anio}` : `${formatoDia.format(d)} al ${formatoDia.format(h)} ${anio}`;
}

const formatoMomento = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Argentina/Buenos_Aires",
});
export const momento = (fecha: Date) => formatoMomento.format(fecha);

export const ESTADO_EVENTO = { preparacion: "En preparación", abierto: "Abierto", cerrado: "Cerrado" };
export const MEDIO_DE_PAGO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta" };
export const TIPO_UBICACION ={ deposito: "Depósito", showroom: "Showroom", evento: "Evento", web: "Web" };
