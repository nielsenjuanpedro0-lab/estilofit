import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, leerSesion } from "@/servidor/sesion-panel";

// Solo filtra a quien no tiene una cookie firmada válida. Si el usuario sigue activo y qué puede
// hacer lo decide servidor/acceso.ts en cada página y cada acción.
export async function middleware(request: NextRequest) {
  if (await leerSesion(request.cookies.get(COOKIE_SESION)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/ingresar", request.url));
}

export const config = {
  matcher: ["/panel", "/panel/:path*"],
};
