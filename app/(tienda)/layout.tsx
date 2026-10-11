// Tienda online: lo que ven los clientes.
import Link from "next/link";
import { LayoutDashboard, UserRound } from "lucide-react";
import BotonCarrito from "@/components/BotonCarrito";
import Logo from "@/components/Logo";
import { usuarioActual } from "@/lib/supabase/server";

export default async function LayoutTienda({ children }: { children: React.ReactNode }) {
  const { user, rol } = await usuarioActual();
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-20 border-b border-borde bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/"><Logo /></Link>
          <nav className="flex items-center gap-2 text-sm">
            {rol === "staff" && <Link href="/admin" className="inline-flex items-center gap-1.5 px-2 font-semibold text-marca"><LayoutDashboard size={16} /> Panel</Link>}
            <Link href={user ? "/mi-cuenta" : "/ingresar"} className="inline-flex items-center gap-1.5 px-2 font-semibold"><UserRound size={16} /> {user ? "Mi cuenta" : "Ingresar"}</Link>
            <BotonCarrito />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <footer className="border-t border-borde py-6 text-center text-xs text-texto-2">Mi Calzado · Envíos y retiro en el local</footer>
    </div>
  );
}
