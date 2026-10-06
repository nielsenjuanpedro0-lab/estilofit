import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Aviso, Boton, Campo } from "@/componentes/primitivos";
import { ingresoBloqueado, registrarIngresoFallido } from "@/servidor/limite-velocidad";
import { COOKIE_SESION, DURACION_SESION_S, claveDeInstalacionCorrecta, crearValorDeSesion } from "@/servidor/sesion-panel";
import { CLAVE_MINIMA, autenticarConClave, crearUsuario, hayUsuarios, registrarAuditoria } from "@/servidor/usuarios";

async function abrirSesion(usuario: { id: number; versionSesion: number }) {
  (await cookies()).set(COOKIE_SESION, await crearValorDeSesion(usuario.id, usuario.versionSesion), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: DURACION_SESION_S,
  });
}

// En Vercel la IP real llega primera en x-forwarded-for.
async function ipDelPedido() {
  return (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "sin-ip";
}

async function ingresar(formulario: FormData) {
  "use server";
  const ip = await ipDelPedido();
  if (ingresoBloqueado(ip)) redirect("/ingresar?error=bloqueado");

  const email = formulario.get("email");
  const clave = formulario.get("clave");
  const usuario = typeof email === "string" && typeof clave === "string" ? await autenticarConClave(email, clave) : null;
  if (!usuario) {
    registrarIngresoFallido(ip);
    redirect("/ingresar?error=clave");
  }
  await abrirSesion(usuario);
  await registrarAuditoria(usuario.id, "Ingreso", "Entró al panel");
  redirect("/panel");
}

const PrimerAdministrador = z.object({
  nombre: z.string().trim().min(1).max(100),
  email: z.email(),
  clave: z.string().min(CLAVE_MINIMA),
  instalacion: z.string().min(1),
});

// Solo funciona mientras no haya ningún usuario: es la puerta de entrada de una instalación nueva.
async function crearPrimerAdministrador(formulario: FormData) {
  "use server";
  const ip = await ipDelPedido();
  if (ingresoBloqueado(ip)) redirect("/ingresar?error=bloqueado");
  if (await hayUsuarios()) redirect("/ingresar");

  const datos = PrimerAdministrador.safeParse(Object.fromEntries(formulario));
  if (!datos.success) redirect("/ingresar?error=datos");
  if (!(await claveDeInstalacionCorrecta(datos.data.instalacion))) {
    registrarIngresoFallido(ip);
    redirect("/ingresar?error=instalacion");
  }
  const usuario = await crearUsuario({ nombre: datos.data.nombre, email: datos.data.email, rol: "administrador", clave: datos.data.clave, pin: null });
  await registrarAuditoria(usuario.id, "Usuarios", `Creó el primer administrador: ${usuario.nombre}`);
  await abrirSesion(usuario);
  redirect("/panel");
}

const ERRORES: Record<string, string> = {
  clave: "El email o la clave no son correctos. Si te olvidaste la clave, pedile a un administrador que te la cambie.",
  bloqueado: "Demasiados intentos con clave equivocada desde esta conexión. Esperá 15 minutos y probá de nuevo.",
  instalacion: "La clave de instalación no es correcta. Es la que está en CLAVE_INSTALACION del servidor.",
  datos: `Revisá los datos: nombre, un email válido y una clave de al menos ${CLAVE_MINIMA} caracteres.`,
};

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const mensaje = error ? ERRORES[error] : undefined;
  const instalacionNueva = !(await hayUsuarios());

  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-100 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-black bg-white shadow-[6px_6px_0_0_#000]">
        <div className="bg-neutral-950 px-6 py-5 text-white">
          <p className="text-3xl font-black tracking-tight">
            ESTILO<span className="text-yellow-300">FIT</span>
          </p>
          <p className="text-sm text-neutral-300">Stock y venta en eventos</p>
        </div>
        <div className="flex flex-col gap-4 p-6">
          {mensaje && <Aviso tono="error">{mensaje}</Aviso>}
          {instalacionNueva ? (
            <form action={crearPrimerAdministrador} className="flex flex-col gap-4">
              <h1 className="text-xl font-black">Crear el primer administrador</h1>
              <p className="text-sm">Todavía no hay usuarios. El primero se crea con la clave de instalación del servidor.</p>
              <Campo etiqueta="Nombre" name="nombre" required autoComplete="name" />
              <Campo etiqueta="Email" name="email" type="email" required autoComplete="email" />
              <Campo etiqueta={`Clave (mínimo ${CLAVE_MINIMA} caracteres)`} name="clave" type="password" required minLength={CLAVE_MINIMA} autoComplete="new-password" />
              <Campo etiqueta="Clave de instalación" name="instalacion" type="password" required autoComplete="off" />
              <Boton type="submit">Crear y entrar</Boton>
            </form>
          ) : (
            <form action={ingresar} className="flex flex-col gap-4">
              <h1 className="text-xl font-black">Ingresar al panel</h1>
              <Campo etiqueta="Email" name="email" type="email" required autoComplete="username" autoFocus />
              <Campo etiqueta="Clave" name="clave" type="password" required autoComplete="current-password" />
              <Boton type="submit">Ingresar</Boton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
