import { almacen, type VarianteBajada } from "@/celular/almacen";
import { pedir, pedirPaquete } from "@/celular/api";

const LADO_IMAGEN = 240;

// Las imágenes se guardan chicas: entran muchas en IndexedDB y la grilla dibuja rápido.
async function comprimir(original: Blob): Promise<Blob> {
  const url = URL.createObjectURL(original);
  try {
    const imagen = new Image();
    imagen.src = url;
    await imagen.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO_IMAGEN;
    lienzo.height = LADO_IMAGEN;
    const contexto = lienzo.getContext("2d");
    if (!contexto) throw new Error("El navegador no permite dibujar imágenes");
    contexto.fillStyle = "#ffffff";
    contexto.fillRect(0, 0, LADO_IMAGEN, LADO_IMAGEN);
    const escala = Math.min(LADO_IMAGEN / (imagen.naturalWidth || LADO_IMAGEN), LADO_IMAGEN / (imagen.naturalHeight || LADO_IMAGEN));
    const ancho = (imagen.naturalWidth || LADO_IMAGEN) * escala;
    const alto = (imagen.naturalHeight || LADO_IMAGEN) * escala;
    contexto.drawImage(imagen, (LADO_IMAGEN - ancho) / 2, (LADO_IMAGEN - alto) / 2, ancho, alto);
    const comprimida = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", 0.8));
    if (!comprimida) throw new Error("No se pudo comprimir una imagen del catálogo");
    return comprimida;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Libera el espacio de un evento terminado. Las ventas quedan (sirven para "reenviar todas"),
// pero solo se puede si ninguna de ese evento está pendiente de subir.
export async function quitarEvento(eventoId: number): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  return almacen.transaction("rw", almacen.eventos, almacen.variantes, almacen.carritos, almacen.ventas, async () => {
    const pendientes = await almacen.ventas.where("[eventoId+estado]").equals([eventoId, "pendiente"]).count();
    if (pendientes > 0) {
      return { ok: false, mensaje: `Este evento tiene ${pendientes} ventas sin subir. Conectate y esperá a que suban antes de quitarlo.` };
    }
    await almacen.variantes.where("eventoId").equals(eventoId).delete();
    await almacen.carritos.delete(eventoId);
    await almacen.eventos.delete(eventoId);
    return { ok: true };
  });
}

type Descarga ={ ok: true; variantes: number; unidades: number } | { ok: false; mensaje: string };

// Todo o nada: "paquete descargado" en la pantalla tiene que querer decir que está completo.
export async function descargarPaquete(eventoId: number): Promise<Descarga> {
  const sesion = await almacen.sesion.get(1);
  if (!sesion) throw new Error("Se intentó bajar un paquete sin el celular dado de alta");

  const resultado = await pedirPaquete(sesion.token, eventoId);
  if (!resultado.ok) {
    if (resultado.revocado) await almacen.sesion.update(1, { revocado: true });
    return { ok: false, mensaje: resultado.mensaje };
  }
  const paquete = resultado.datos;

  const imagenes = new Map<string, Blob>();
  for (const url of new Set(paquete.variantes.map((v) => v.imagenUrl).filter((u) => u !== null))) {
    const pedido = await pedir(url, null);
    if (pedido.tipo === "sin-senal") return { ok: false, mensaje: "Se cortó la señal mientras bajaban las imágenes. Probá de nuevo con mejor conexión." };
    if (!pedido.respuesta.ok) return { ok: false, mensaje: `No se pudo bajar la imagen ${url} (el servidor respondió ${pedido.respuesta.status}).` };
    imagenes.set(url, await comprimir(await pedido.respuesta.blob()));
  }

  const variantes: VarianteBajada[] = paquete.variantes.map(({ imagenUrl, ...v }) => ({
    ...v,
    eventoId,
    imagen: imagenUrl ? (imagenes.get(imagenUrl) ?? null) : null,
  }));
  await almacen.transaction("rw", [almacen.eventos, almacen.variantes, almacen.vendedores, almacen.turno], async () => {
    await almacen.variantes.where("eventoId").equals(eventoId).delete();
    await almacen.variantes.bulkPut(variantes);
    // Los vendedores son los de ahora: si alguien fue desactivado o cambió el PIN, deja de valer acá.
    await almacen.vendedores.clear();
    await almacen.vendedores.bulkPut(paquete.vendedores);
    const turno = await almacen.turno.get(1);
    if (turno && !paquete.vendedores.some((v) => v.id === turno.vendedorId)) await almacen.turno.delete(1);
    await almacen.eventos.put({
      id: paquete.evento.id,
      nombre: paquete.evento.nombre,
      lugar: paquete.evento.lugar,
      fechaDesde: paquete.evento.fechaDesde,
      fechaHasta: paquete.evento.fechaHasta,
      descargadoEn: Date.now(),
      otrosDispositivos: paquete.otrosDispositivos,
    });
  });
  return { ok: true, variantes: variantes.length, unidades: variantes.reduce((suma, v) => suma + Math.max(0, v.stock), 0) };
}
