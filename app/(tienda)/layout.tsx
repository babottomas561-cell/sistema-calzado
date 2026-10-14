// Tienda online: lo que ven los clientes. Identidad propia (ver .tienda en globals.css), aislada del panel.
import Link from "next/link";
import { Bricolage_Grotesque, Instrument_Serif } from "next/font/google";
import { CircleUserRound, Clock, MapPin, MessageCircle, Search } from "lucide-react";
import BotonCarrito from "@/components/BotonCarrito";
import { IconoInstagram } from "@/components/IconoInstagram";
import Marca from "@/components/Marca";
import { crearCliente, usuarioActual } from "@/lib/supabase/server";
import { datosLegales, datosTienda } from "@/lib/tienda";
import Avisos from "./marco/Avisos";
import Cabecera from "./marco/Cabecera";
import WhatsAppFlotante from "./marco/WhatsAppFlotante";
import Cursor from "@/components/tienda/Cursor";
import SuavizarScroll from "@/components/tienda/SuavizarScroll";

const fuente = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-tienda", display: "swap" });
// Serif editorial: frases, ante-títulos y títulos de colección (contrasta con la letra gruesa)
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export default async function LayoutTienda({ children }: { children: React.ReactNode }) {
  const supabase = await crearCliente();
  const [{ user, rol }, tienda, legal, { data: primera }] = await Promise.all([usuarioActual(), datosTienda(), datosLegales(),
    // ¿La portada arranca con una campaña a pantalla completa? Entonces la cabecera flota transparente encima
    supabase.from("inicio_secciones").select("tipo, imagen_url, contenido").eq("visible", true).order("orden").order("id").limit(1).maybeSingle()]);
  const contacto = tienda;
  const portada = primera?.contenido as { estilo?: string; marca_gigante?: boolean } | null;
  const sobreCampana = primera?.tipo === "portada" && !!primera.imagen_url && portada?.estilo === "foto";
  return (
    <div className={`${fuente.variable} ${serif.variable} tienda min-h-screen`}>
      <SuavizarScroll />
      <Cursor />
      {/* Avisos del local (se editan en el panel → Tienda online); si hay varios, rotan */}
      <Avisos avisos={tienda.avisos ?? []} enlace={tienda.aviso_enlace} />
      <Cabecera sobreCampana={sobreCampana} marcaGigante={portada?.marca_gigante !== false}>
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
          <Link href="/" className="marca-cabecera mr-auto transition-opacity duration-300" aria-label={`${tienda.nombre}: inicio`}><Marca nombre={tienda.nombre} logo={tienda.logo_url} logoOscuro={tienda.logo_oscuro_url} /></Link>
          <nav className="flex items-center text-sm font-semibold">
            <Link href="/tienda" className="inline-flex h-11 items-center rounded-sm px-2.5 hover:bg-marca-suave sm:px-3">Tienda</Link>
            <Link href="/tienda#buscar" aria-label="Buscar" className="grid h-11 w-11 place-items-center rounded-sm hover:bg-marca-suave"><Search size={22} strokeWidth={1.8} /></Link>
            {rol === "staff" && <Link href="/admin" className="hidden h-11 items-center rounded-sm px-3 hover:bg-marca-suave sm:inline-flex">Panel</Link>}
            <Link href={user ? "/mi-cuenta" : "/ingresar"} aria-label={user ? "Mi cuenta" : "Ingresar"} className="inline-flex h-11 items-center gap-2 rounded-sm px-2.5 hover:bg-marca-suave">
              <CircleUserRound size={22} strokeWidth={1.8} /><span className="hidden sm:inline">{user ? "Mi cuenta" : "Ingresar"}</span></Link>
            <BotonCarrito />
          </nav>
        </div>
      </Cabecera>
      {contacto.whatsapp && <WhatsAppFlotante numero={contacto.whatsapp} />}
      <main className="mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6">{children}</main>
      <footer className="border-t border-borde bg-marca-suave">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
          <div><Marca nombre={tienda.nombre} logo={tienda.logo_url} /><p className="mt-3 max-w-xs text-sm text-texto-2">Elegí tu prenda, reservala online y retirala en el local o recibila en tu casa.</p></div>
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
            {tienda.instagram && <a href={`https://instagram.com/${tienda.instagram}`} target="_blank" rel="noopener" className="flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4"><IconoInstagram size={17} /> @{tienda.instagram}</a>}
          </div>
        </div>
        <div className="border-t border-borde px-4 py-5 text-center text-xs text-texto-2">
          <nav className="mb-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 font-semibold" aria-label="Información legal">
            {legal.terminos && <Link href="/terminos" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">Términos y condiciones</Link>}
            {legal.privacidad && <Link href="/privacidad" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">Política de privacidad</Link>}
            <Link href="/arrepentimiento" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">Botón de arrepentimiento</Link>
            {legal.datos?.defensa_consumidor_url && <a href={legal.datos.defensa_consumidor_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center underline-offset-4 hover:underline">Defensa del Consumidor</a>}
          </nav>
          {legal.datos?.razon_social && (
            <p className="mx-auto mb-2 max-w-2xl">{legal.datos.razon_social}{legal.datos.cuit ? ` · CUIT ${legal.datos.cuit}` : ""}{legal.datos.condicion_iva ? ` · ${legal.datos.condicion_iva}` : ""}
              {legal.datos.domicilio_legal ? ` · ${legal.datos.domicilio_legal}` : ""}{legal.datos.email_contacto ? ` · ${legal.datos.email_contacto}` : ""}</p>
          )}
          © {new Date().getFullYear()} {tienda.nombre}
        </div>
      </footer>
    </div>
  );
}
