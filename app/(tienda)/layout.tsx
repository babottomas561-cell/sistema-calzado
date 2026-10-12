// Tienda online: lo que ven los clientes. Identidad propia (ver .tienda en globals.css), aislada del panel.
import Link from "next/link";
import { Bricolage_Grotesque } from "next/font/google";
import { CircleUserRound, Clock, MapPin, MessageCircle, Search } from "lucide-react";
import BotonCarrito from "@/components/BotonCarrito";
import Marca from "@/components/Marca";
import { usuarioActual } from "@/lib/supabase/server";
import { datosTienda } from "@/lib/tienda";
import { crearCliente } from "@/lib/supabase/server";

const fuente = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-tienda", display: "swap" });

export default async function LayoutTienda({ children }: { children: React.ReactNode }) {
  const [{ user, rol }, tienda] = await Promise.all([usuarioActual(), datosTienda()]);
  const supabase = await crearCliente();
  const { data: contacto } = await supabase.from("configuracion_tienda").select("whatsapp, direccion_retiro, horario").single();
  return (
    <div className={`${fuente.variable} tienda min-h-screen`}>
      <header className="sticky top-0 z-20 border-b border-borde bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="mr-auto" aria-label={`${tienda.nombre}: inicio`}><Marca nombre={tienda.nombre} /></Link>
          <nav className="flex items-center text-sm font-semibold">
            <Link href="/#buscar" aria-label="Buscar" className="grid h-11 w-11 place-items-center rounded-sm hover:bg-marca-suave"><Search size={22} strokeWidth={1.8} /></Link>
            {rol === "staff" && <Link href="/admin" className="hidden h-11 items-center rounded-sm px-3 hover:bg-marca-suave sm:inline-flex">Panel</Link>}
            <Link href={user ? "/mi-cuenta" : "/ingresar"} aria-label={user ? "Mi cuenta" : "Ingresar"} className="inline-flex h-11 items-center gap-2 rounded-sm px-2.5 hover:bg-marca-suave">
              <CircleUserRound size={22} strokeWidth={1.8} /><span className="hidden sm:inline">{user ? "Mi cuenta" : "Ingresar"}</span></Link>
            <BotonCarrito />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">{children}</main>
      <footer className="border-t border-borde bg-marca-suave">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
          <div><Marca nombre={tienda.nombre} /><p className="mt-3 max-w-xs text-sm text-texto-2">Elegí tu prenda, reservala online y retirala en el local o recibila en tu casa.</p></div>
          <div className="space-y-2 text-sm">
            <p className="font-bold">Retiro en el local</p>
            {contacto?.direccion_retiro && <p className="flex gap-2 text-texto-2"><MapPin size={16} className="mt-0.5 shrink-0" />{contacto.direccion_retiro}</p>}
            {contacto?.horario && <p className="flex gap-2 text-texto-2"><Clock size={16} className="mt-0.5 shrink-0" />{contacto.horario}</p>}
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-bold">¿Dudas?</p>
            {contacto?.whatsapp
              ? <a href={`https://wa.me/${contacto.whatsapp}`} className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4"><MessageCircle size={17} /> Escribinos por WhatsApp</a>
              : <p className="text-texto-2">Consultanos en el local.</p>}
          </div>
        </div>
        <div className="border-t border-borde py-4 text-center text-xs text-texto-2">© {new Date().getFullYear()} {tienda.nombre}</div>
      </footer>
    </div>
  );
}
