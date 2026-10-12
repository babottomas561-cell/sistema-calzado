import type { Metadata, Viewport } from "next";
import "./globals.css";
import { datosTienda } from "@/lib/tienda";

export async function generateMetadata(): Promise<Metadata> {
  const { nombre } = await datosTienda();
  return { title: nombre, description: "Stock, ventas y compras" };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
