import { z } from "zod";
import { ListaDeEventos, Paquete } from "@/contrato/paquete";

// Las llamadas del celular al servidor. Sin señal, fetch falla y eso vuelve como resultado
// "sin señal": es un estado normal en un evento, no un error de programación.

// En el evento hay antena pero a veces no conecta: un pedido colgado no puede trabar la pantalla.
const TIEMPO_MAXIMO_MS = 15_000;

export type Pedido = { tipo: "sin-senal" } | { tipo: "respuesta"; respuesta: Response };

export async function pedir(ruta: string, token: string | null, init: RequestInit = {}): Promise<Pedido> {
  const encabezados = new Headers(init.headers);
  if (token) encabezados.set("Authorization", `Bearer ${token}`);
  try {
    const respuesta = await fetch(ruta, { ...init, headers: encabezados, cache: "no-store", signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS) });
    return { tipo: "respuesta", respuesta };
  } catch (error) {
    // fetch solo rechaza por red caída, timeout o pedido abortado. Cualquier otra cosa es un bug y sube.
    if (error instanceof TypeError || (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError"))) {
      return { tipo: "sin-senal" };
    }
    throw error;
  }
}

const CuerpoDeError = z.object({ error: z.string() });

export async function mensajeDeError(respuesta: Response) {
  const cuerpo = CuerpoDeError.safeParse(await respuesta.json().catch(() => null));
  return cuerpo.success ? cuerpo.data.error : `El servidor respondió ${respuesta.status}. Probá de nuevo en un rato.`;
}

type Resultado<T> = { ok: true; datos: T } | { ok: false; mensaje: string; revocado: boolean };

const SIN_SENAL = "No hay señal. Conectate a internet (wifi o datos) y probá de nuevo.";

async function leer<T>(pedido: Pedido, esquema: z.ZodType<T>): Promise<Resultado<T>> {
  if (pedido.tipo === "sin-senal") return { ok: false, mensaje: SIN_SENAL, revocado: false };
  const { respuesta } = pedido;
  if (!respuesta.ok) return { ok: false, mensaje: await mensajeDeError(respuesta), revocado: respuesta.status === 401 };
  const datos = esquema.safeParse(await respuesta.json());
  if (!datos.success) {
    return { ok: false, mensaje: "La respuesta del servidor no es la que espera esta versión de la app. Cerrala y abrila con señal para actualizarla.", revocado: false };
  }
  return { ok: true, datos: datos.data };
}

const RespuestaAlta = z.object({ token: z.string(), dispositivo: z.object({ id: z.number().int(), nombre: z.string() }) });

export async function darDeAlta(codigo: string) {
  const pedido = await pedir("/api/dispositivos/alta", null, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  return leer(pedido, RespuestaAlta);
}

export async function pedirEventos(token: string) {
  return leer(await pedir("/api/eventos", token), ListaDeEventos);
}

export async function pedirPaquete(token: string, eventoId: number) {
  return leer(await pedir(`/api/paquete?evento=${eventoId}`, token), Paquete);
}
