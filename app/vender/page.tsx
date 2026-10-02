import type { Viewport } from "next";
import { PantallaDeVenta } from "@/celular/pantalla-de-venta";

// Sin zoom: un doble toque accidental no puede romper una venta a la mitad.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
  colorScheme: "light",
};

// Ruta estática con el evento en la query (/vender?evento=3): una sola página que el service
// worker precachea y abre en modo avión. Una ruta dinámica por evento no se precachearía.
export default function Vender() {
  return <PantallaDeVenta />;
}
