import { db } from "@/db/conexion";
import { productos } from "@/db/esquema";
import type { VentaDelDispositivo } from "@/contrato/sincronizacion";
import { crearProducto, crearUbicacion, registrarIngreso } from "@/servidor/catalogo";
import { cerrarEvento, type ClaseDeFaltante, type Conteo } from "@/servidor/cierre";
import { canjearCodigo, crearDispositivo, revocarDispositivo } from "@/servidor/dispositivos";
import { abrirEvento, crearEvento } from "@/servidor/eventos";
import { registrarLote } from "@/servidor/sincronizacion";
import { transferir } from "@/servidor/transferencias";

// La semilla pasa por las mismas funciones que usa la app: catálogo, ingreso, transferencias,
// sincronización y cierre. Si algo de eso se rompe, la semilla se rompe con eso.

// Generador con semilla fija (mulberry32): el seed da siempre lo mismo,
// así los números de la demo no cambian entre corridas.
function generadorConSemilla(semilla: number) {
  let estado = semilla;
  return function siguiente() {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INDUMENTARIA = ["S", "M", "L", "XL", "XXL"];
const MEDIAS = ["35-38", "39-42", "43-46"];

type ProductoDeCatalogo = {
  nombre: string;
  marca: string;
  categoria: keyof typeof PICTOGRAMA;
  precio: number;
  talles: string[];
  // En nutrición el "color" es el sabor.
  colores: string[];
  // Rango de unidades por variante en el depósito y en el showroom.
  deposito: [number, number];
  showroom: [number, number];
  // Cuánto se vende en un evento, en relación con el resto. Los geles salen de a montones.
  salida: number;
};

const catalogo: ProductoDeCatalogo[] = [
  { nombre: "Speedcross 6", marca: "Salomon", categoria: "Zapatillas trail", precio: 289000, talles: ["40", "41", "42", "43", "44", "45", "46"], colores: ["Negro"], deposito: [3, 8], showroom: [0, 2], salida: 1 },
  { nombre: "Speedgoat 6 Mujer", marca: "Hoka", categoria: "Zapatillas trail", precio: 329000, talles: ["36", "37", "38", "39"], colores: ["Lila"], deposito: [2, 6], showroom: [0, 2], salida: 1 },
  { nombre: "Speedgoat 6", marca: "Hoka", categoria: "Zapatillas trail", precio: 329000, talles: ["41", "42", "43", "44"], colores: ["Azul"], deposito: [2, 6], showroom: [0, 2], salida: 1 },
  { nombre: "Remera técnica Trail", marca: "Estilofit", categoria: "Remeras", precio: 38500, talles: INDUMENTARIA, colores: ["Negro"], deposito: [10, 25], showroom: [2, 5], salida: 4 },
  { nombre: "Remera técnica Mujer", marca: "Estilofit", categoria: "Remeras", precio: 36500, talles: ["S", "M", "L", "XL"], colores: ["Coral"], deposito: [8, 20], showroom: [2, 4], salida: 3 },
  { nombre: "Calza larga térmica", marca: "Estilofit", categoria: "Calzas", precio: 52000, talles: ["S", "M", "L", "XL"], colores: ["Negro"], deposito: [8, 18], showroom: [1, 4], salida: 2 },
  { nombre: "Calza corta running", marca: "Estilofit", categoria: "Calzas", precio: 34900, talles: ["S", "M", "L", "XL"], colores: ["Negro"], deposito: [8, 18], showroom: [1, 4], salida: 2 },
  { nombre: "Campera rompeviento", marca: "Estilofit", categoria: "Camperas", precio: 96000, talles: INDUMENTARIA, colores: ["Amarillo flúo"], deposito: [5, 12], showroom: [1, 3], salida: 2 },
  { nombre: "Medias de compresión Full Socks", marca: "Compressport", categoria: "Medias", precio: 31500, talles: MEDIAS, colores: ["Negro"], deposito: [15, 30], showroom: [3, 6], salida: 5 },
  { nombre: "Medias trail cortas", marca: "Estilofit", categoria: "Medias", precio: 12500, talles: MEDIAS, colores: ["Gris"], deposito: [25, 50], showroom: [4, 8], salida: 8 },
  { nombre: "Mochila de hidratación ADV Skin 5", marca: "Salomon", categoria: "Mochilas", precio: 198000, talles: ["S", "M", "L"], colores: ["Negro"], deposito: [2, 6], showroom: [0, 1], salida: 1 },
  { nombre: "Gel energético", marca: "GU", categoria: "Nutrición", precio: 4800, talles: ["Único"], colores: ["Limón", "Frutilla-Banana", "Chocolate"], deposito: [120, 240], showroom: [10, 20], salida: 20 },
  { nombre: "Gel con cafeína", marca: "Enervit", categoria: "Nutrición", precio: 5400, talles: ["Único"], colores: ["Naranja"], deposito: [80, 160], showroom: [10, 20], salida: 12 },
  { nombre: "Sales minerales x 10", marca: "Enervit", categoria: "Nutrición", precio: 9800, talles: ["Único"], colores: ["Limón"], deposito: [30, 60], showroom: [5, 10], salida: 6 },
  { nombre: "Cinturón porta-caramañola", marca: "Estilofit", categoria: "Accesorios", precio: 24500, talles: ["S/M", "L/XL"], colores: ["Negro"], deposito: [10, 20], showroom: [2, 4], salida: 3 },
  { nombre: "Caramañola blanda 500 ml", marca: "Salomon", categoria: "Accesorios", precio: 19500, talles: ["Único"], colores: ["Transparente"], deposito: [15, 30], showroom: [3, 6], salida: 4 },
  { nombre: "Antiparras Vanquisher", marca: "Speedo", categoria: "Antiparras", precio: 34000, talles: ["Único"], colores: ["Transparente", "Ahumada"], deposito: [6, 14], showroom: [1, 3], salida: 1 },
  { nombre: "Visera trail", marca: "Estilofit", categoria: "Accesorios", precio: 21000, talles: ["Único"], colores: ["Negro", "Blanco"], deposito: [10, 20], showroom: [2, 4], salida: 3 },
  { nombre: "Cuello multifunción", marca: "Estilofit", categoria: "Accesorios", precio: 14500, talles: ["Único"], colores: ["Negro", "Camuflado"], deposito: [15, 30], showroom: [3, 6], salida: 3 },
];

// Sin fotos reales del cliente (importar su catálogo está fuera de alcance): un pictograma por categoría.
const PICTOGRAMA = {
  "Zapatillas trail": "zapatilla",
  Remeras: "remera",
  Calzas: "calza",
  Camperas: "campera",
  Medias: "medias",
  Mochilas: "mochila",
  Nutrición: "nutricion",
  Accesorios: "accesorio",
  Antiparras: "antiparras",
};

// La mercadería entró antes de la temporada de eventos.
const FECHA_INGRESO = new Date("2026-08-01T09:00:00-03:00");

export async function sembrar() {
  const azar = generadorConSemilla(20261002);
  const entre = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
  // UUID v4 armado con el generador fijo, para que también las ventas den lo mismo en cada corrida.
  const uuid = () => {
    const hex = Array.from({ length: 32 }, () => Math.floor(azar() * 16).toString(16));
    hex[12] = "4";
    hex[16] = "89ab".charAt(Math.floor(azar() * 4));
    const s = hex.join("");
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  };

  const yaHayDatos = await db().select({ id: productos.id }).from(productos).limit(1);
  if (yaHayDatos.length > 0) throw new Error("La base ya tiene productos: la semilla solo corre sobre una base vacía");

  const deposito = await crearUbicacion("Depósito", "deposito");
  const showroom = await crearUbicacion("Showroom Tandil", "showroom");
  await crearUbicacion("Web", "web");

  const enDeposito = new Map<number, number>();
  const ingresoDeposito: { varianteId: number; cantidad: number }[] = [];
  const ingresoShowroom: { varianteId: number; cantidad: number }[] = [];
  const surtido: { varianteId: number; precio: number; salida: number; categoria: string }[] = [];

  for (const item of catalogo) {
    const { variantes } = await crearProducto({
      nombre: item.nombre,
      marca: item.marca,
      categoria: item.categoria,
      variantes: item.colores.flatMap((color) =>
        item.talles.map((talle) => ({
          talle,
          color,
          precio: item.precio,
          imagenUrl: `/productos/${PICTOGRAMA[item.categoria]}.svg`,
          // Márgenes chicos: el costo anda entre el 58% y el 72% del precio.
          costo: Math.round((item.precio * (0.58 + azar() * 0.14)) / 100) * 100,
        })),
      ),
    });
    for (const v of variantes) {
      const cantidad = entre(...item.deposito);
      enDeposito.set(v.id, cantidad);
      ingresoDeposito.push({ varianteId: v.id, cantidad });
      const enShowroom = entre(...item.showroom);
      if (enShowroom > 0) ingresoShowroom.push({ varianteId: v.id, cantidad: enShowroom });
      surtido.push({ varianteId: v.id, precio: v.precio, salida: item.salida, categoria: item.categoria });
    }
  }
  await registrarIngreso(deposito.id, ingresoDeposito, FECHA_INGRESO);
  await registrarIngreso(showroom.id, ingresoShowroom, FECHA_INGRESO);

  // Lo que viaja a un evento: más de lo que más sale, sin pasarse de lo que hay en el depósito.
  const armarViaje = () =>
    surtido.map((s) => {
      const disponible = enDeposito.get(s.varianteId) ?? 0;
      const cantidad = Math.min(disponible, Math.max(1, Math.round(s.salida * (1.5 + azar()))));
      enDeposito.set(s.varianteId, disponible - cantidad);
      return { varianteId: s.varianteId, cantidad };
    });

  // --- Evento ya cerrado, con ventas: para que los reportes tengan contenido. ---
  const tandil = await crearEvento({ nombre: "Tandil Trail Run", lugar: "Tandil, Sierra del Tigre", fechaDesde: "2026-09-12", fechaHasta: "2026-09-13" });
  const viajeTandil = armarViaje();
  const transferenciaTandil = await transferir({ origenId: deposito.id, destinoId: tandil.ubicacionId, items: viajeTandil, nota: "Viaje al Tandil Trail Run" });
  if (!transferenciaTandil.ok) throw new Error("La semilla pidió más stock del que hay en el depósito");
  await abrirEvento(tandil.id);

  const { id: celularId, codigo } = await crearDispositivo("Celular equipo 1");
  if (!(await canjearCodigo(codigo))) throw new Error("No se pudo dar de alta el celular de la semilla");

  const quedan = new Map(viajeTandil.map((v) => [v.varianteId, v.cantidad]));
  const pesoTotal = surtido.reduce((suma, s) => suma + s.salida, 0);
  const elegirVariante = () => {
    let tirada = azar() * pesoTotal;
    for (const s of surtido) {
      tirada -= s.salida;
      if (tirada <= 0) return s;
    }
    return surtido[surtido.length - 1];
  };

  const ventasTandil: VentaDelDispositivo[] = [];
  for (let i = 0; i < 110; i++) {
    const renglones = new Map<number, { varianteId: number; cantidad: number; precio: number }>();
    for (let r = entre(1, 3); r > 0; r--) {
      const s = elegirVariante();
      if (!s || (quedan.get(s.varianteId) ?? 0) <= 0) continue;
      quedan.set(s.varianteId, (quedan.get(s.varianteId) ?? 0) - 1);
      const previo = renglones.get(s.varianteId);
      renglones.set(s.varianteId, { varianteId: s.varianteId, cantidad: (previo?.cantidad ?? 0) + 1, precio: s.precio });
    }
    if (renglones.size === 0) continue;

    const items = [...renglones.values()];
    const total = items.reduce((suma, it) => suma + it.precio * it.cantidad, 0);
    const tirada = azar();
    const medioPago = tirada < 0.45 ? "efectivo" : tirada < 0.8 ? "transferencia" : "tarjeta";
    // En efectivo se redondea para abajo al mil: queda dentro del tope, entra como redondeo y no para revisar.
    const cobrado = medioPago === "efectivo" ? Math.floor(total / 1000) * 1000 : total;
    const dia = i < 60 ? "2026-09-12" : "2026-09-13";
    const hora = String(entre(8, 13)).padStart(2, "0");
    const minuto = String(entre(0, 59)).padStart(2, "0");
    ventasTandil.push({
      clientUuid: uuid(),
      eventoId: tandil.id,
      vendidoAt: `${dia}T${hora}:${minuto}:00-03:00`,
      medioPago,
      total: cobrado,
      items: items.map(({ varianteId, cantidad }) => ({ varianteId, cantidad })),
    });
  }
  for (let i = 0; i < ventasTandil.length; i += 50) {
    const respuesta = await registrarLote(celularId, ventasTandil.slice(i, i + 50));
    if (respuesta.rechazadas.length > 0) throw new Error(`La semilla generó ventas inválidas: ${JSON.stringify(respuesta.rechazadas)}`);
  }

  // Al volver se cuenta todo y aparecen diferencias reales de un evento: dos medias que no están
  // (faltante real), un gel que se cobró y no se cargó, y una remera de más que alguien guardó
  // en la caja equivocada.
  const conteo: Conteo[] = [...quedan.entries()].map(([varianteId, contadas]) => ({ varianteId, contadas }));
  const diferencias: [string, number, ClaseDeFaltante][] = [
    ["Medias", -2, "faltante"],
    ["Nutrición", -1, "venta_no_registrada"],
    ["Remeras", 1, "faltante"],
  ];
  for (const [categoria, delta, faltanteEs] of diferencias) {
    const fila = conteo.find((c) => c.contadas >= 2 && surtido.find((s) => s.varianteId === c.varianteId)?.categoria === categoria);
    if (!fila) throw new Error(`No quedó remanente de ${categoria} para simular la diferencia del cierre`);
    fila.contadas += delta;
    fila.faltanteEs = faltanteEs;
  }
  const cierre = await cerrarEvento(tandil.id, conteo, deposito.id);
  if (!cierre.ok) throw new Error(`La semilla no pudo cerrar el evento: ${cierre.motivo}`);
  // El celular de ese evento ya no está en uso.
  await revocarDispositivo(celularId);

  // --- Evento nuevo, listo para operar: stock asignado y abierto. ---
  const sierra = await crearEvento({
    nombre: "Desafío Sierra de la Ventana",
    lugar: "Sierra de la Ventana",
    fechaDesde: "2026-10-17",
    fechaHasta: "2026-10-18",
  });
  const transferenciaSierra = await transferir({
    origenId: deposito.id,
    destinoId: sierra.ubicacionId,
    items: armarViaje().filter((v) => v.cantidad > 0),
    nota: "Viaje al Desafío Sierra de la Ventana",
  });
  if (!transferenciaSierra.ok) throw new Error("La semilla pidió más stock del que hay en el depósito");
  await abrirEvento(sierra.id);
}
