"use client";
// Menú: lateral en compu, desplegable en el celular. Íconos de lucide-react (de línea, todos del mismo trazo).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BadgePercent, BookText, BookUser, Boxes, ChartBar, ChevronDown, ExternalLink, FileText, House, KeyRound, LogOut, Menu as IconoMenu, MessageCircleMore, Package, PackagePlus, PackageSearch, PackageX, PanelLeftClose, PanelLeftOpen, Plug, Plus, Printer, Receipt, Scale, ScanBarcode, Search, Settings2, ShieldCheck, ShoppingBag, Store, Tags, Truck, Undo2, Users, Wallet, X, type LucideIcon } from "lucide-react";
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
    { href: "/admin/etiquetas", texto: "Etiquetas", icono: ScanBarcode, permisos: ["stock.ver", "productos.editar"] },
    { href: "/admin/precios", texto: "Precios", icono: Tags, permisos: ["precios.editar", "proveedores.gestionar"] },
    { href: "/admin/promociones", texto: "Promociones", icono: BadgePercent, permisos: ["promociones.gestionar"] },
    { href: "/admin/fallados", texto: "Fallados", icono: PackageX, permisos: ["stock.ver"] },
    { href: "/admin/reposicion", texto: "Reposición", icono: PackageSearch, permisos: ["compras.registrar"] },
  ] },
  { titulo: "Análisis", items: [
    { href: "/admin/informes", texto: "Informes", icono: ChartBar, permisos: ["informes.ventas", "informes.stock", "gastos.gestionar"] },
    { href: "/admin/gastos", texto: "Gastos", icono: Wallet, permisos: ["gastos.gestionar"] },
    { href: "/admin/contabilidad", texto: "Contabilidad", icono: BookText, permisos: ["contabilidad.ver", "contabilidad.configurar"] },
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
    { href: "/admin/impresion", texto: "Impresión", icono: Printer, permisos: ["tablas.editar"] },
    { href: "/admin/equipo", texto: "Equipo", icono: ShieldCheck, permisos: ["equipo.administrar"] },
  ] },
];
const TODAS = ["/admin/ventas/nueva", ...GRUPOS.flatMap((g) => g.items.map((i) => i.href))];
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function Menu({ version, logo, nombre, email, rolEquipo, permisos, salir }: { version?: string; logo?: string | null; nombre: string; email: string; rolEquipo: string | null; permisos: string[]; salir: () => Promise<void> }) {
  const ruta = usePathname();
  const gruposPermitidos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permisos.length || puede(permisos, ...i.permisos)) })).filter((g) => g.items.length);
  const vende = puede(permisos, "ventas.registrar");
  const [abierto, setAbierto] = useState(false);
  const [compacto, setCompacto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [plegados, setPlegados] = useState<string[]>([]);
  // Queda marcado el ítem cuya ruta coincide más largo con la actual ("/ventas/nueva" gana sobre "/ventas")
  const actual = TODAS.filter((h) => (h === "/admin" ? ruta === "/admin" : ruta === h || ruta.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0];
  const itemActual = GRUPOS.flatMap((g) => g.items).find((item) => item.href === actual);
  const textoBusqueda = normalizar(busqueda.trim());
  const grupos = gruposPermitidos
    .map((grupo) => ({ ...grupo, items: textoBusqueda ? grupo.items.filter((item) => normalizar(item.texto).includes(textoBusqueda)) : grupo.items }))
    .filter((grupo) => grupo.items.length);

  useEffect(() => {
    const restaurar = requestAnimationFrame(() => {
      setCompacto(localStorage.getItem("menu-admin-compacto") === "si");
      try {
        const guardados = JSON.parse(localStorage.getItem("menu-admin-plegados") ?? "[]");
        if (Array.isArray(guardados)) setPlegados(guardados.filter((titulo): titulo is string => typeof titulo === "string"));
      } catch {
        localStorage.removeItem("menu-admin-plegados");
      }
    });
    return () => cancelAnimationFrame(restaurar);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const cerrarConEscape = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", cerrarConEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", cerrarConEscape);
      document.body.style.overflow = "";
    };
  }, [abierto]);

  const cambiarCompacto = () => {
    const siguiente = !compacto;
    setCompacto(siguiente);
    localStorage.setItem("menu-admin-compacto", siguiente ? "si" : "no");
  };

  const cambiarGrupo = (titulo: string) => {
    const siguientes = plegados.includes(titulo) ? plegados.filter((grupo) => grupo !== titulo) : [...plegados, titulo];
    setPlegados(siguientes);
    localStorage.setItem("menu-admin-plegados", JSON.stringify(siguientes));
  };

  return (
    <>
      {/* Barra superior en el celular */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-borde bg-white/95 px-4 py-2.5 backdrop-blur md:hidden print:hidden">
        <div className="min-w-0"><Logo nombre={nombre} imagen={logo} /></div>
        <span className="mx-3 min-w-0 flex-1 truncate text-right text-xs font-medium text-texto-2">{itemActual?.texto ?? "Panel"}</span>
        <button onClick={() => setAbierto(!abierto)} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-borde bg-white" aria-label={abierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={abierto} aria-controls="menu-administracion">
          {abierto ? <X size={18} /> : <IconoMenu size={18} />}
        </button>
      </div>

      {abierto && <button type="button" className="fixed inset-0 top-[61px] z-10 bg-black/25 md:hidden" onClick={() => setAbierto(false)} aria-label="Cerrar menú" />}

      <aside id="menu-administracion" className={`${abierto ? "flex" : "hidden"} fixed bottom-0 right-0 top-[61px] z-20 w-[min(22rem,92vw)] flex-col overflow-hidden border-l border-borde bg-white shadow-2xl md:sticky md:top-0 md:flex md:h-screen ${compacto ? "md:w-[76px]" : "md:w-64"} md:shrink-0 md:border-l-0 md:border-r md:shadow-none print:!hidden`}>
        <div className={`hidden items-center gap-2 pb-4 pt-5 md:flex ${compacto ? "justify-center px-2" : "px-5"}`}>
          {!compacto && <div className="min-w-0 flex-1"><Logo nombre={nombre} imagen={logo} /></div>}
          <button type="button" onClick={cambiarCompacto} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900" title={compacto ? "Ampliar menú" : "Compactar menú"} aria-label={compacto ? "Ampliar menú" : "Compactar menú"}>
            {compacto ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <div className={`px-3 pt-3 md:pt-0 ${compacto ? "md:hidden" : ""}`}>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-borde bg-gray-50 px-3 focus-within:border-marca focus-within:bg-white">
            <Search size={16} className="shrink-0 text-gray-400" />
            <span className="sr-only">Buscar en el menú</span>
            <input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar sección…" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400" />
            {busqueda && <button type="button" onClick={() => setBusqueda("")} className="grid h-6 w-6 place-items-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700" aria-label="Limpiar búsqueda"><X size={14} /></button>}
          </label>
        </div>

        {vende && <div className="px-3 pt-3">
          <Link href="/admin/ventas/nueva" onClick={() => setAbierto(false)}
            title={compacto ? "Nueva venta" : undefined}
            className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition ${actual === "/admin/ventas/nueva" ? "bg-marca-oscuro" : "bg-marca hover:bg-marca-oscuro"}`}>
            <Plus size={18} strokeWidth={2.4} /><span className={compacto ? "md:hidden" : ""}>Nueva venta</span>
          </Link>
        </div>}
        <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="Administración">
          {grupos.map((g, i) => (
            <div key={i} className="mb-3">
              {g.titulo && <button type="button" onClick={() => cambiarGrupo(g.titulo!)} className={`flex w-full items-center justify-between rounded px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700 ${compacto ? "md:hidden" : ""}`} aria-expanded={textoBusqueda ? true : !plegados.includes(g.titulo)}>
                {g.titulo}<ChevronDown size={14} className={`transition-transform ${textoBusqueda || !plegados.includes(g.titulo) ? "rotate-0" : "-rotate-90"}`} />
              </button>}
              {(compacto || textoBusqueda || !g.titulo || !plegados.includes(g.titulo)) && g.items.map(({ href, texto, icono: Icono }) => {
                const activo = href === actual;
                return (
                  <Link key={href} href={href} onClick={() => setAbierto(false)} aria-current={activo ? "page" : undefined}
                    title={compacto ? texto : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${compacto ? "md:justify-center" : ""} ${activo ? "bg-marca-suave text-marca" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                    <Icono size={18} strokeWidth={activo ? 2.2 : 1.8} className="shrink-0" /><span className={compacto ? "md:hidden" : ""}>{texto}</span>
                  </Link>
                );
              })}
            </div>
          ))}
          {!grupos.length && <p className="px-3 py-8 text-center text-sm text-texto-2">No encontramos esa sección.</p>}
        </nav>
        <div className="border-t border-borde px-3 py-3 text-sm">
          <a href="/" target="_blank" title={compacto ? "Ver la tienda" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 ${compacto ? "md:justify-center" : ""}`}>
            <ExternalLink size={18} strokeWidth={1.8} /><span className={compacto ? "md:hidden" : ""}>Ver la tienda</span></a>
          <Link href="/nueva-clave" onClick={() => setAbierto(false)} title={compacto ? "Cambiar contraseña" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 ${compacto ? "md:justify-center" : ""}`}>
            <KeyRound size={18} strokeWidth={1.8} /><span className={compacto ? "md:hidden" : ""}>Cambiar contraseña</span></Link>
          <div className={`flex items-center gap-3 px-3 py-2 ${compacto ? "md:flex-col md:px-0" : ""}`}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-100 text-gray-500"><BookUser size={15} /></span>
            <span className={`min-w-0 flex-1 text-xs text-texto-2 ${compacto ? "md:hidden" : ""}`}><span className="block truncate">{email}</span>{rolEquipo && <span className="block font-semibold text-gray-600">{rolEquipo}</span>}</span>
            <form action={salir}><button className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={16} /></button></form>
          </div>
          {version && <p className={`px-3 pt-1 text-[11px] text-gray-400 ${compacto ? "md:hidden" : ""}`}>Versión {version}</p>}
        </div>
      </aside>
    </>
  );
}
