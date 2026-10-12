"use client";
// Menú: lateral en compu, desplegable en el celular. Íconos de lucide-react (de línea, todos del mismo trazo).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BadgePercent, KeyRound, BookUser, Boxes, ChartBar, ExternalLink, FileText, PackageSearch, ShieldCheck, Tags, House, LogOut, Menu as IconoMenu, MessageCircleMore, Package, PackagePlus,
  PackageX, Plug, Plus, Receipt, Scale, Wallet, Undo2, Settings2, ShoppingBag, Store, Truck, Users, X, type LucideIcon,
} from "lucide-react";
import Logo from "@/components/Logo";
import { puede, type Permiso } from "@/lib/permisos";

// Cada ítem aparece si el usuario tiene alguno de sus permisos (la base controla igual lo que puede hacer)
type Item = { href: string; texto: string; icono: LucideIcon; permisos: Permiso[] };
const GRUPOS: { titulo?: string; items: Item[] }[] = [
  { items: [{ href: "/admin", texto: "Inicio", icono: House, permisos: [] }] },
  { titulo: "Operación", items: [
    { href: "/admin/ventas", texto: "Ventas", icono: Receipt, permisos: ["ventas.registrar", "ventas.ver_todas"] },
    { href: "/admin/devoluciones", texto: "Cambios y devol.", icono: Undo2, permisos: ["ventas.registrar", "ventas.ver_todas"] },
    { href: "/admin/presupuestos", texto: "Presupuestos", icono: FileText, permisos: ["ventas.registrar", "ventas.ver_todas"] },
    { href: "/admin/pedidos", texto: "Pedidos", icono: ShoppingBag, permisos: ["pedidos.gestionar"] },
    { href: "/admin/arrepentimientos", texto: "Arrepentimientos", icono: Scale, permisos: ["pedidos.gestionar"] },
    { href: "/admin/compras", texto: "Compras", icono: PackagePlus, permisos: ["compras.registrar"] },
  ] },
  { titulo: "Catálogo", items: [
    { href: "/admin/productos", texto: "Productos", icono: Package, permisos: ["costos.ver"] },
    { href: "/admin/stock", texto: "Stock", icono: Boxes, permisos: ["stock.ver"] },
    { href: "/admin/precios", texto: "Precios", icono: Tags, permisos: ["precios.editar", "proveedores.gestionar"] },
    { href: "/admin/promociones", texto: "Promociones", icono: BadgePercent, permisos: ["promociones.gestionar"] },
    { href: "/admin/fallados", texto: "Fallados", icono: PackageX, permisos: ["stock.ver"] },
    { href: "/admin/reposicion", texto: "Reposición", icono: PackageSearch, permisos: ["compras.registrar"] },
  ] },
  { titulo: "Análisis", items: [
    { href: "/admin/informes", texto: "Informes", icono: ChartBar, permisos: ["informes.ventas", "informes.stock", "gastos.gestionar"] },
    { href: "/admin/gastos", texto: "Gastos", icono: Wallet, permisos: ["gastos.gestionar"] },
  ] },
  { titulo: "Contactos", items: [
    { href: "/admin/clientes", texto: "Clientes", icono: Users, permisos: ["clientes.ver"] },
    { href: "/admin/seguimientos", texto: "Seguimientos", icono: MessageCircleMore, permisos: ["clientes.ver"] },
    { href: "/admin/proveedores", texto: "Proveedores", icono: Truck, permisos: ["proveedores.gestionar", "compras.registrar"] },
  ] },
  { titulo: "Configuración", items: [
    { href: "/admin/tienda", texto: "Tienda online", icono: Store, permisos: ["tienda.editar"] },
    { href: "/admin/integraciones", texto: "Integraciones", icono: Plug, permisos: ["tienda.editar"] },
    { href: "/admin/tablas", texto: "Tablas", icono: Settings2, permisos: ["tablas.editar"] },
    { href: "/admin/equipo", texto: "Equipo", icono: ShieldCheck, permisos: ["equipo.administrar"] },
  ] },
];
const TODAS = ["/admin/ventas/nueva", ...GRUPOS.flatMap((g) => g.items.map((i) => i.href))];

export default function Menu({ version, logo, nombre, email, rolEquipo, permisos, salir }: { version?: string; logo?: string | null; nombre: string; email: string; rolEquipo: string | null; permisos: string[]; salir: () => Promise<void> }) {
  const ruta = usePathname();
  const grupos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permisos.length || puede(permisos, ...i.permisos)) })).filter((g) => g.items.length);
  const vende = puede(permisos, "ventas.registrar");
  const [abierto, setAbierto] = useState(false);
  // Queda marcado el ítem cuya ruta coincide más largo con la actual ("/ventas/nueva" gana sobre "/ventas")
  const actual = TODAS.filter((h) => (h === "/admin" ? ruta === "/admin" : ruta === h || ruta.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {/* Barra superior en el celular */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-borde bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Logo nombre={nombre} imagen={logo} />
        <button onClick={() => setAbierto(!abierto)} className="grid h-9 w-9 place-items-center rounded-lg border border-borde" aria-label="Menú">
          {abierto ? <X size={18} /> : <IconoMenu size={18} />}
        </button>
      </div>

      <aside className={`${abierto ? "flex" : "hidden"} fixed inset-0 top-[57px] z-10 flex-col overflow-y-auto bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:border-r md:border-borde`}>
        <div className="hidden px-5 pb-4 pt-5 md:block"><Logo nombre={nombre} imagen={logo} /></div>
        {vende && <div className="px-3 pt-3 md:pt-0">
          <Link href="/admin/ventas/nueva" onClick={() => setAbierto(false)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition ${actual === "/admin/ventas/nueva" ? "bg-marca-oscuro" : "bg-marca hover:bg-marca-oscuro"}`}>
            <Plus size={18} strokeWidth={2.4} /> Nueva venta
          </Link>
        </div>}
        <nav className="flex-1 px-3 py-3">
          {grupos.map((g, i) => (
            <div key={i} className="mb-3">
              {g.titulo && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{g.titulo}</div>}
              {g.items.map(({ href, texto, icono: Icono }) => {
                const activo = href === actual;
                return (
                  <Link key={href} href={href} onClick={() => setAbierto(false)} aria-current={activo ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${activo ? "bg-marca-suave text-marca" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                    <Icono size={18} strokeWidth={activo ? 2.2 : 1.8} />{texto}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="border-t border-borde px-3 py-3 text-sm">
          <a href="/" target="_blank" className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100">
            <ExternalLink size={18} strokeWidth={1.8} /> Ver la tienda</a>
          <Link href="/nueva-clave" onClick={() => setAbierto(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100">
            <KeyRound size={18} strokeWidth={1.8} /> Cambiar contraseña</Link>
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500"><BookUser size={15} /></span>
            <span className="min-w-0 flex-1 text-xs text-texto-2"><span className="block truncate">{email}</span>{rolEquipo && <span className="block font-semibold text-gray-600">{rolEquipo}</span>}</span>
            <form action={salir}><button className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button></form>
          </div>
          {version && <p className="px-3 pt-1 text-[11px] text-gray-400">Versión {version}</p>}
        </div>
      </aside>
    </>
  );
}
