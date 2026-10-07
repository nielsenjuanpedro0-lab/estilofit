import { puede, type Permiso } from "@/contrato/permisos";
import { MEDIO_DE_PAGO } from "@/componentes/formato";
import { usuarioActual } from "@/servidor/acceso";
import { listarAuditoria } from "@/servidor/auditoria";
import { listarCompras } from "@/servidor/compras";
import { listarMovimientos } from "@/servidor/movimientos";
import { matrizDeStock } from "@/servidor/stock";
import { listarVentas } from "@/servidor/ventas";

// Exporta lo mismo que muestra la pantalla, con los mismos filtros, a un CSV que Excel en
// castellano abre bien: punto y coma, coma decimal y BOM para que respete los acentos.

type Celda = string | number | Date | null;

function celda(valor: Celda) {
  if (valor === null) return "";
  if (valor instanceof Date) return valor.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  if (typeof valor === "number") return String(valor).replace(".", ",");
  // Un texto que empieza con = + - @ Excel lo ejecuta como fórmula: se neutraliza con un apóstrofo.
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor;
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

function csv(encabezados: string[], filas: Celda[][], nombre: string) {
  const texto = [encabezados, ...filas].map((fila) => fila.map(celda).join(";")).join("\r\n");
  const fecha = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${texto}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="estilofit-${nombre}-${fecha}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

const PERMISO: Record<string, Permiso> = { ventas: "ver", movimientos: "ver", stock: "ver", compras: "ver", auditoria: "administrar" };

export async function GET(request: Request, { params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const permiso = PERMISO[tipo];
  if (!permiso) return new Response("Ese listado no se exporta", { status: 404 });
  const usuario = await usuarioActual();
  if (!usuario) return new Response("La sesión venció. Volvé a ingresar.", { status: 401 });
  if (!puede(usuario.rol, permiso)) return new Response("Tu rol no puede exportar este listado.", { status: 403 });

  const parametros = Object.fromEntries(new URL(request.url).searchParams);

  if (tipo === "ventas") {
    const { filas } = await listarVentas(parametros, true);
    return csv(
      ["Número", "Llegó", "Hora del celular", "Evento", "Vendedor", "Celular", "Medio", "Unidades", "Cobrado", "Catálogo", "Para revisar", "Motivo", "Revisada", "Código"],
      filas.map((v) => [
        v.id,
        v.recibidoAt,
        v.vendidoAt,
        v.evento,
        v.vendedor,
        v.celular,
        MEDIO_DE_PAGO[v.medioPago],
        v.unidades,
        v.total,
        v.totalCatalogo,
        v.paraRevisar ? "Sí" : "No",
        v.motivoRevision,
        v.revisadaAt,
        v.clientUuid,
      ]),
      "ventas",
    );
  }

  if (tipo === "movimientos") {
    const { filas } = await listarMovimientos(parametros, true);
    return csv(
      ["Número", "Registrado", "Ocurrió", "Tipo", "Producto", "Talle", "Color", "SKU", "Unidades", "Sale de", "Entra a", "Quién", "Celular", "Nota"],
      filas.map((m) => [m.id, m.recibidoAt, m.ocurridoAt, m.tipo, m.producto, m.talle, m.color, m.sku, m.cantidad, m.origen, m.destino, m.usuario, m.celular, m.nota]),
      "movimientos",
    );
  }

  if (tipo === "stock") {
    const ubicacion = Number(parametros.ubicacion);
    const { columnas, filas } = await matrizDeStock({
      q: parametros.q,
      categoria: parametros.categoria,
      ubicacion: Number.isInteger(ubicacion) && ubicacion > 0 ? ubicacion : undefined,
    });
    return csv(
      ["Producto", "Marca", "Categoría", "Talle", "Color", "SKU", "Precio", ...columnas.map((c) => c.nombre), "Total"],
      filas.map((f) => [f.producto, f.marca, f.categoria, f.talle, f.color, f.sku, f.precio, ...f.porUbicacion, f.total]),
      "stock",
    );
  }

  if (tipo === "compras") {
    const { filas } = await listarCompras(parametros, true);
    return csv(
      ["Número", "Fecha", "Proveedor", "Comprobante", "Destino", "Unidades", "Total a costo", "Anulada"],
      filas.map((c) => [c.id, c.fecha, c.proveedor, c.comprobante, c.destino, c.unidades, c.total, c.anulada ? "Sí" : "No"]),
      "compras",
    );
  }

  const { filas } = await listarAuditoria(parametros, true);
  return csv(
    ["Cuándo", "Quién", "Área", "Qué hizo"],
    filas.map((a) => [a.ocurridoAt, a.usuario, a.accion, a.detalle]),
    "auditoria",
  );
}
