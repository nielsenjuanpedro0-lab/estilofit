import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, sesionValida } from "@/servidor/sesion-panel";

export async function middleware(request: NextRequest) {
  if (await sesionValida(request.cookies.get(COOKIE_SESION)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/ingresar", request.url));
}

export const config = {
  matcher: ["/panel", "/panel/:path*"],
};
