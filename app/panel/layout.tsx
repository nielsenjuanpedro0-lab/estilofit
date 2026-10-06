import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { Escritorio } from "@/app/panel/escritorio";
import { GRUPOS } from "@/app/panel/secciones";
import { NOMBRE_DE_ROL, puede } from "@/contrato/permisos";
import { db } from "@/db/conexion";
import { dispositivos, eventos, ventas } from "@/db/esquema";
import { paginaConPermiso } from "@/servidor/acceso";

// Todo el panel lee la base en cada pedido. Sin esto, `next build` intenta prerenderizar y no hay DATABASE_URL.
export const dynamic = "force-dynamic";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const usuario = await paginaConPermiso("ver");

  // La barra lateral muestra solo lo que el rol puede usar; el servidor igual lo vuelve a chequear.
  const grupos = GRUPOS.map((g) => ({ ...g, secciones: g.secciones.filter((s) => puede(usuario.rol, s.permiso)) })).filter((g) => g.secciones.length > 0);

  // Lo que conviene mirar ya: eventos en curso, ventas para revisar y celulares con ventas sin subir.
  const [eventosEnCurso, revisar, pendientes] = await Promise.all([
    db().$count(eventos, ne(eventos.estado, "cerrado")),
    db().$count(ventas, and(eq(ventas.paraRevisar, true), isNull(ventas.revisadaAt))),
    db().$count(dispositivos, and(isNull(dispositivos.revocadoAt), gt(dispositivos.pendientesInformadas, 0))),
  ]);

  return (
    <Escritorio
      grupos={grupos}
      contadores={{ eventos: eventosEnCurso, revisar, pendientes }}
      usuario={{ nombre: usuario.nombre, rol: NOMBRE_DE_ROL[usuario.rol] }}
    >
      {children}
    </Escritorio>
  );
}
