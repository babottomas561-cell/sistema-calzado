"use client";
// Menú: lateral en compu, desplegable en el celular. Íconos de lucide-react (de línea, todos del mismo trazo).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BookUser, Boxes, ChartBar, ExternalLink, House, LogOut, Menu as IconoMenu, MessageCircleMore, Package, PackagePlus,
  Plus, Receipt, Settings2, ShoppingBag, Truck, Users, X, type LucideIcon,
} from "lucide-react";
import Logo from "@/components/Logo";

type Item = { href: string; texto: string; icono: LucideIcon };
const GRUPOS: { titulo?: string; items: Item[] }[] = [
  { items: [{ href: "/admin", texto: "Inicio", icono: House }] },
  { titulo: "Operación", items: [
    { href: "/admin/ventas", texto: "Ventas", icono: Receipt },
    { href: "/admin/pedidos", texto: "Pedidos", icono: ShoppingBag },
    { href: "/admin/compras", texto: "Compras", icono: PackagePlus },
  ] },
  { titulo: "Catálogo", items: [
    { href: "/admin/productos", texto: "Productos", icono: Package },
    { href: "/admin/stock", texto: "Stock", icono: Boxes },
  ] },
  { titulo: "Análisis", items: [{ href: "/admin/informes", texto: "Informes", icono: ChartBar }] },
  { titulo: "Contactos", items: [
    { href: "/admin/clientes", texto: "Clientes", icono: Users },
    { href: "/admin/seguimientos", texto: "Seguimientos", icono: MessageCircleMore },
    { href: "/admin/proveedores", texto: "Proveedores", icono: Truck },
  ] },
  { titulo: "Configuración", items: [{ href: "/admin/tablas", texto: "Tablas", icono: Settings2 }] },
];
const TODAS = ["/admin/ventas/nueva", ...GRUPOS.flatMap((g) => g.items.map((i) => i.href))];

export default function Menu({ email, salir }: { email: string; salir: () => Promise<void> }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  // Queda marcado el ítem cuya ruta coincide más largo con la actual ("/ventas/nueva" gana sobre "/ventas")
  const actual = TODAS.filter((h) => (h === "/admin" ? ruta === "/admin" : ruta === h || ruta.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {/* Barra superior en el celular */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-borde bg-white/95 px-4 py-2.5 backdrop-blur md:hidden">
        <Logo />
        <button onClick={() => setAbierto(!abierto)} className="grid h-9 w-9 place-items-center rounded-lg border border-borde" aria-label="Menú">
          {abierto ? <X size={18} /> : <IconoMenu size={18} />}
        </button>
      </div>

      <aside className={`${abierto ? "flex" : "hidden"} fixed inset-0 top-[57px] z-10 flex-col overflow-y-auto bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:border-r md:border-borde`}>
        <div className="hidden px-5 pb-4 pt-5 md:block"><Logo /></div>
        <div className="px-3 pt-3 md:pt-0">
          <Link href="/admin/ventas/nueva" onClick={() => setAbierto(false)}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition ${actual === "/admin/ventas/nueva" ? "bg-blue-800" : "bg-marca hover:bg-blue-800"}`}>
            <Plus size={18} strokeWidth={2.4} /> Nueva venta
          </Link>
        </div>
        <nav className="flex-1 px-3 py-3">
          {GRUPOS.map((g, i) => (
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
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500"><BookUser size={15} /></span>
            <span className="min-w-0 flex-1 truncate text-xs text-texto-2">{email}</span>
            <form action={salir}><button className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button></form>
          </div>
        </div>
      </aside>
    </>
  );
}
