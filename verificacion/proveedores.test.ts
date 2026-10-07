import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cambiarProveedorActivo, crearProveedor, editarProveedor, listarProveedores, nombreDeProveedorEnUso } from "@/servidor/proveedores";
import { levantarBaseEmbebida } from "@/verificacion/base-embebida";

let b: Awaited<ReturnType<typeof levantarBaseEmbebida>>;
beforeEach(async () => {
  b = await levantarBaseEmbebida();
});
afterEach(async () => {
  await b.cerrar();
});

const vacio = { cuit: null, telefono: null, email: null, nota: null };

describe("proveedores", () => {
  it("crea, edita y desactiva; el listado pone los activos primero", async () => {
    const salomon = await crearProveedor({ nombre: "Salomon Argentina", ...vacio, cuit: "30-71234567-8" });
    await crearProveedor({ nombre: "Distribuidora Andes", ...vacio });
    await editarProveedor(salomon.id, { nombre: "Salomon AR", ...vacio, telefono: "011 4444-5555" });
    await cambiarProveedorActivo(salomon.id, false);

    const lista = await listarProveedores();
    expect(lista.map((p) => [p.nombre, p.activo, p.compras, p.ultimaCompra])).toEqual([
      ["Distribuidora Andes", true, 0, null],
      ["Salomon AR", false, 0, null],
    ]);
    expect(lista[1]?.telefono).toBe("011 4444-5555");
  });

  it("detecta un nombre en uso sin importar mayúsculas, salvo el propio", async () => {
    const andes = await crearProveedor({ nombre: "Distribuidora Andes", ...vacio });
    expect(await nombreDeProveedorEnUso("distribuidora andes", null)).toBe(true);
    expect(await nombreDeProveedorEnUso("Distribuidora Andes", andes.id)).toBe(false);
    expect(await nombreDeProveedorEnUso("Otra", null)).toBe(false);
  });
});
