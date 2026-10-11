"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes, Receipt, type LucideIcon } from "lucide-react";

const PESTANAS: { href: string; texto: string; icono: LucideIcon; permiso: string }[] = [
  { href: "/admin/informes/ventas", texto: "Ventas", icono: Receipt, permiso: "informes.ventas" },
  { href: "/admin/informes/stock", texto: "Stock valorizado", icono: Boxes, permiso: "informes.stock" },
];

export default function Pestanas({ permisos }: { permisos: string[] }) {
  const ruta = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-borde">
      {PESTANAS.filter((t) => permisos.includes(t.permiso)).map(({ href, texto, icono: Icono }) => {
        const activa = ruta.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={activa ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold ${activa ? "border-marca text-marca" : "border-transparent text-texto-2 hover:text-gray-900"}`}>
            <Icono size={16} strokeWidth={activa ? 2.2 : 1.8} />{texto}
          </Link>
        );
      })}
    </nav>
  );
}
