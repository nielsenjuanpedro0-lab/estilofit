import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Aviso, Boton, Campo } from "@/componentes/primitivos";
import { COOKIE_SESION, DURACION_SESION_S, claveDePanelCorrecta, crearValorDeSesion } from "@/servidor/sesion-panel";

async function ingresar(formulario: FormData) {
  "use server";
  const clave = formulario.get("clave");
  if (typeof clave !== "string" || !(await claveDePanelCorrecta(clave))) redirect("/ingresar?error=1");

  (await cookies()).set(COOKIE_SESION, await crearValorDeSesion(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SESION_S,
  });
  redirect("/panel");
}

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-3xl font-black">Estilofit · Panel</h1>
      {error && <Aviso tono="error">La clave no es correcta. Es la que está en CLAVE_PANEL del servidor.</Aviso>}
      <form action={ingresar} className="flex flex-col gap-4">
        <Campo etiqueta="Clave del panel" name="clave" type="password" autoComplete="current-password" required autoFocus />
        <Boton type="submit">Ingresar</Boton>
      </form>
    </main>
  );
}
