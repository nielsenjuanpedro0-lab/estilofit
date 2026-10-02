import type { BaseDeDatos } from "@/db/conexion";
import { movimientos, productos, ubicaciones, variantes } from "@/db/esquema";

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
  categoria: string;
  precio: number;
  talles: string[];
  // En nutrición el "color" es el sabor.
  colores: string[];
  // Rango de unidades por variante en el depósito y en el showroom.
  deposito: [number, number];
  showroom: [number, number];
};

const catalogo: ProductoDeCatalogo[] = [
  { nombre: "Speedcross 6", marca: "Salomon", categoria: "Zapatillas trail", precio: 289000, talles: ["40", "41", "42", "43", "44", "45", "46"], colores: ["Negro"], deposito: [3, 8], showroom: [0, 2] },
  { nombre: "Speedgoat 6 Mujer", marca: "Hoka", categoria: "Zapatillas trail", precio: 329000, talles: ["36", "37", "38", "39"], colores: ["Lila"], deposito: [2, 6], showroom: [0, 2] },
  { nombre: "Speedgoat 6", marca: "Hoka", categoria: "Zapatillas trail", precio: 329000, talles: ["41", "42", "43", "44"], colores: ["Azul"], deposito: [2, 6], showroom: [0, 2] },
  { nombre: "Remera técnica Trail", marca: "Estilofit", categoria: "Remeras", precio: 38500, talles: INDUMENTARIA, colores: ["Negro"], deposito: [10, 25], showroom: [2, 5] },
  { nombre: "Remera técnica Mujer", marca: "Estilofit", categoria: "Remeras", precio: 36500, talles: ["S", "M", "L", "XL"], colores: ["Coral"], deposito: [8, 20], showroom: [2, 4] },
  { nombre: "Calza larga térmica", marca: "Estilofit", categoria: "Calzas", precio: 52000, talles: ["S", "M", "L", "XL"], colores: ["Negro"], deposito: [8, 18], showroom: [1, 4] },
  { nombre: "Calza corta running", marca: "Estilofit", categoria: "Calzas", precio: 34900, talles: ["S", "M", "L", "XL"], colores: ["Negro"], deposito: [8, 18], showroom: [1, 4] },
  { nombre: "Campera rompeviento", marca: "Estilofit", categoria: "Camperas", precio: 96000, talles: INDUMENTARIA, colores: ["Amarillo flúo"], deposito: [5, 12], showroom: [1, 3] },
  { nombre: "Medias de compresión Full Socks", marca: "Compressport", categoria: "Medias", precio: 31500, talles: MEDIAS, colores: ["Negro"], deposito: [15, 30], showroom: [3, 6] },
  { nombre: "Medias trail cortas", marca: "Estilofit", categoria: "Medias", precio: 12500, talles: MEDIAS, colores: ["Gris"], deposito: [25, 50], showroom: [4, 8] },
  { nombre: "Mochila de hidratación ADV Skin 5", marca: "Salomon", categoria: "Mochilas", precio: 198000, talles: ["S", "M", "L"], colores: ["Negro"], deposito: [2, 6], showroom: [0, 1] },
  { nombre: "Gel energético", marca: "GU", categoria: "Nutrición", precio: 4800, talles: ["Único"], colores: ["Limón", "Frutilla-Banana", "Chocolate"], deposito: [120, 240], showroom: [10, 20] },
  { nombre: "Gel con cafeína", marca: "Enervit", categoria: "Nutrición", precio: 5400, talles: ["Único"], colores: ["Naranja"], deposito: [80, 160], showroom: [10, 20] },
  { nombre: "Sales minerales x 10", marca: "Enervit", categoria: "Nutrición", precio: 9800, talles: ["Único"], colores: ["Limón"], deposito: [30, 60], showroom: [5, 10] },
  { nombre: "Cinturón porta-caramañola", marca: "Estilofit", categoria: "Accesorios", precio: 24500, talles: ["S/M", "L/XL"], colores: ["Negro"], deposito: [10, 20], showroom: [2, 4] },
  { nombre: "Caramañola blanda 500 ml", marca: "Salomon", categoria: "Accesorios", precio: 19500, talles: ["Único"], colores: ["Transparente"], deposito: [15, 30], showroom: [3, 6] },
  { nombre: "Antiparras Vanquisher", marca: "Speedo", categoria: "Antiparras", precio: 34000, talles: ["Único"], colores: ["Transparente", "Ahumada"], deposito: [6, 14], showroom: [1, 3] },
  { nombre: "Visera trail", marca: "Estilofit", categoria: "Accesorios", precio: 21000, talles: ["Único"], colores: ["Negro", "Blanco"], deposito: [10, 20], showroom: [2, 4] },
  { nombre: "Cuello multifunción", marca: "Estilofit", categoria: "Accesorios", precio: 14500, talles: ["Único"], colores: ["Negro", "Camuflado"], deposito: [15, 30], showroom: [3, 6] },
];

// La mercadería entró antes de la temporada de eventos.
const FECHA_CARGA_INICIAL = new Date("2026-08-01T09:00:00-03:00");

export async function sembrar(base: BaseDeDatos) {
  const azar = generadorConSemilla(20261002);
  const entre = ([min, max]: [number, number]) => min + Math.floor(azar() * (max - min + 1));

  await base.transaction(async (tx) => {
    const yaHayDatos = await tx.select({ id: productos.id }).from(productos).limit(1);
    if (yaHayDatos.length > 0) throw new Error("La base ya tiene productos: la semilla solo corre sobre una base vacía");

    const [deposito, showroom] = await tx
      .insert(ubicaciones)
      .values([
        { nombre: "Depósito", tipo: "deposito" },
        { nombre: "Showroom Tandil", tipo: "showroom" },
        { nombre: "Web", tipo: "web" },
      ])
      .returning();
    if (!deposito || !showroom) throw new Error("No se crearon las ubicaciones");

    for (const [i, item] of catalogo.entries()) {
      const [producto] = await tx
        .insert(productos)
        .values({ nombre: item.nombre, marca: item.marca, categoria: item.categoria })
        .returning();
      if (!producto) throw new Error(`No se creó el producto ${item.nombre}`);

      // SKU corto de 3 o 4 dígitos: número de producto + número de variante. "101", "1902".
      const combinaciones = item.colores.flatMap((color) => item.talles.map((talle) => ({ talle, color })));
      const filas = await tx
        .insert(variantes)
        .values(
          combinaciones.map(({ talle, color }, j) => ({
            productoId: producto.id,
            sku: `${i + 1}${String(j + 1).padStart(2, "0")}`,
            talle,
            color,
            precio: item.precio,
            costo: Math.round((item.precio * (0.58 + azar() * 0.14)) / 100) * 100,
          })),
        )
        .returning();

      for (const variante of filas) {
        const enDeposito = entre(item.deposito);
        const enShowroom = entre(item.showroom);
        await tx.insert(movimientos).values({
          varianteId: variante.id,
          ubicacionDestinoId: deposito.id,
          cantidad: enDeposito,
          tipo: "carga_inicial",
          ocurridoAt: FECHA_CARGA_INICIAL,
        });
        if (enShowroom > 0) {
          await tx.insert(movimientos).values({
            varianteId: variante.id,
            ubicacionDestinoId: showroom.id,
            cantidad: enShowroom,
            tipo: "carga_inicial",
            ocurridoAt: FECHA_CARGA_INICIAL,
          });
        }
      }
    }
  });
}
