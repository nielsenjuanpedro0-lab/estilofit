import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { Aviso, Boton, Campo } from "@/componentes/primitivos";
import { ingresoBloqueado, registrarIngresoFallido } from "@/servidor/limite-velocidad";
import { COOKIE_SESION, DURACION_SESION_S, claveDePanelCorrecta, crearValorDeSesion } from "@/servidor/sesion-panel";

async function ingresar(formulario: FormData) {
  "use server";
  // En Vercel la IP real llega primera en x-forwarded-for.
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
  if (ingresoBloqueado(ip)) redirect("/ingresar?error=bloqueado");

  const clave = formulario.get("clave");
  if (typeof clave !== "string" || !(await claveDePanelCorrecta(clave))) {
    registrarIngresoFallido(ip);
    redirect("/ingresar?error=clave");
  }

  (await cookies()).set(COOKIE_SESION, await crearValorDeSesion(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SESION_S,
  });
  redirect("/panel");
}

const ERRORES: Record<string, string> = {
  clave: "La clave no es correcta. Es la que está en CLAVE_PANEL del servidor.",
  bloqueado: "Demasiados intentos con clave equivocada desde esta conexión. Esperá 15 minutos y probá de nuevo.",
};

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const mensaje = error ? ERRORES[error] : undefined;
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-3xl font-black">Estilofit · Panel</h1>
      {mensaje && <Aviso tono="error">{mensaje}</Aviso>}
      <form action={ingresar} className="flex flex-col gap-4">
        <Campo etiqueta="Clave del panel" name="clave" type="password" autoComplete="current-password" required autoFocus />
        <Boton type="submit">Ingresar</Boton>
      </form>
    </main>
  );
}
