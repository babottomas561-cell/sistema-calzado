import type { Metadata, Viewport } from "next";
import "./globals.css";
import { datosTienda } from "@/lib/tienda";

export async function generateMetadata(): Promise<Metadata> {
  const { nombre, icono_url } = await datosTienda();
  // El ícono de la pestaña sale de /icono (el cargado en Tienda online o la inicial); la v cambia cuando se cambia
  const v = encodeURIComponent((icono_url ?? nombre).slice(-24));
  return { title: nombre, description: "Stock, ventas y compras", icons: { icon: `/icono?v=${v}`, apple: `/icono?v=${v}` } };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
