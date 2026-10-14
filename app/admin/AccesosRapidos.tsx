// Accesos rápidos del Inicio: las pantallas que más se usan, solo las que esta persona puede abrir y que están encendidas en este local.
import Link from "next/link";
import { ArrowLeftRight, Boxes, ChartBar, Package, Receipt, ShoppingBag, Users, Wallet, type LucideIcon } from "lucide-react";
import { puede, type Permiso } from "@/lib/permisos";

const ACCESOS: { href: string; texto: string; Icono: LucideIcon; permisos: Permiso[] }[] = [
  { href: "/admin/ventas", texto: "Ventas", Icono: Receipt, permisos: ["ventas.registrar", "ventas.ver_todas"] },
  { href: "/admin/devoluciones", texto: "Cambios", Icono: ArrowLeftRight, permisos: ["ventas.registrar", "ventas.ver_todas"] },
  { href: "/admin/pedidos", texto: "Pedidos", Icono: ShoppingBag, permisos: ["pedidos.gestionar"] },
  { href: "/admin/clientes", texto: "Clientes", Icono: Users, permisos: ["clientes.ver"] },
  { href: "/admin/stock", texto: "Stock", Icono: Boxes, permisos: ["stock.ver"] },
  { href: "/admin/productos", texto: "Productos", Icono: Package, permisos: ["costos.ver_precio_compra", "productos.editar"] },
  { href: "/admin/informes", texto: "Informes", Icono: ChartBar, permisos: ["informes.ventas", "informes.stock", "gastos.gestionar"] },
  { href: "/admin/cuenta-corriente", texto: "Cuenta corriente", Icono: Wallet, permisos: ["cc.ver", "cc.cobrar"] },
];

export default function AccesosRapidos({ permisos, apagados }: { permisos: string[]; apagados: Set<string> }) {
  const visibles = ACCESOS.filter((a) => puede(permisos, ...a.permisos) && !apagados.has(a.href));
  if (!visibles.length) return null;
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-4 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {visibles.map(({ href, texto, Icono }) => (
        <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-xl border border-borde bg-white px-1 py-3 text-center text-xs font-medium shadow-sm transition hover:bg-gray-50 active:scale-[0.98]">
          <Icono size={20} strokeWidth={1.8} className="text-marca" /><span className="leading-tight">{texto}</span>
        </Link>
      ))}
    </nav>
  );
}
