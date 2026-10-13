"use client";
// Menú: lateral en compu, desplegable en el celular. Íconos de lucide-react (de línea, todos del mismo trazo).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BookUser, Check, ChevronDown, Eye, EyeOff, ExternalLink, KeyRound, LockKeyhole, LogOut, Menu as IconoMenu, PanelLeftClose, PanelLeftOpen, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import Logo from "@/components/Logo";
import { puede } from "@/lib/permisos";
import { GRUPOS, type Item } from "@/lib/menu";

const TODAS = ["/admin/ventas/nueva", ...GRUPOS.flatMap((g) => g.items.map((i) => i.href))];
const normalizar = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Props = {
  version?: string; logo?: string | null; nombre: string; email: string; rolEquipo: string | null; permisos: string[]; salir: () => Promise<void>;
  desactivados: string[];                       // módulos apagados en esta instalación (Equipo → Módulos)
  favoritos: string[]; ocultos: string[];       // lo que eligió esta persona
  guardarMenu: (favoritos: string[], ocultos: string[]) => Promise<void>;
};

export default function Menu({ version, logo, nombre, email, rolEquipo, permisos, salir, desactivados, favoritos: favoritosIniciales, ocultos: ocultosIniciales, guardarMenu }: Props) {
  const ruta = usePathname();
  // Lo que esta persona puede usar y la instalación tiene encendido (de acá sale también la lista para personalizar)
  const gruposPermitidos = GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => (!i.permisos.length || puede(permisos, ...i.permisos)) && (i.fijo || !desactivados.includes(i.href))) })).filter((g) => g.items.length);
  const [favoritos, setFavoritos] = useState(favoritosIniciales);
  const [ocultos, setOcultos] = useState(ocultosIniciales);
  const [personalizando, setPersonalizando] = useState(false);
  const [errorMenu, setErrorMenu] = useState(false);
  const guardar = (fav: string[], oc: string[]) => {
    setFavoritos(fav); setOcultos(oc); setErrorMenu(false);
    guardarMenu(fav, oc).catch(() => setErrorMenu(true));
  };
  const alternarFavorito = (href: string) => guardar(favoritos.includes(href) ? favoritos.filter((h) => h !== href) : [...favoritos, href], ocultos);
  const alternarOculto = (href: string) => guardar(favoritos.filter((h) => h !== href), ocultos.includes(href) ? ocultos.filter((h) => h !== href) : [...ocultos, href]);
  const sePuedeOcultar = (i: Item) => i.href !== "/admin";
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
  // Lo que se ve: sin lo que la persona ocultó (salvo al personalizar, que muestra todo para poder volver a prenderlo)
  // Al buscar se ve todo (también lo que ocultó), así nunca queda una sección inalcanzable
  const visibles = gruposPermitidos.map((g) => ({ ...g, items: personalizando || textoBusqueda ? g.items : g.items.filter((i) => !ocultos.includes(i.href)) }));
  const favoritosVisibles = personalizando ? [] : visibles.flatMap((g) => g.items).filter((i) => favoritos.includes(i.href));
  const grupos = [...(favoritosVisibles.length && !textoBusqueda ? [{ titulo: "Favoritos", items: favoritosVisibles, esFavoritos: true }] : []),
    ...visibles.map((g) => ({ ...g, esFavoritos: false }))]
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
          {personalizando && <p className={`mb-3 rounded-lg bg-marca-suave px-3 py-2 text-xs text-gray-700 ${compacto ? "md:hidden" : ""}`}>Tocá el ojo para mostrar u ocultar una sección en <b>tu</b> menú. No cambia lo que podés hacer.</p>}
          {grupos.map((g) => (
            <div key={g.titulo ?? "inicio"} className="mb-3">
              {g.titulo && <button type="button" onClick={() => cambiarGrupo(g.titulo!)} className={`flex w-full items-center justify-between rounded px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-700 ${compacto ? "md:hidden" : ""}`} aria-expanded={textoBusqueda ? true : !plegados.includes(g.titulo)}>
                <span className="flex items-center gap-1.5">{g.esFavoritos && <Star size={12} className="fill-current" />}{g.titulo}</span><ChevronDown size={14} className={`transition-transform ${textoBusqueda || !plegados.includes(g.titulo) ? "rotate-0" : "-rotate-90"}`} />
              </button>}
              {(compacto || textoBusqueda || !g.titulo || !plegados.includes(g.titulo)) && g.items.map((item) => {
                const { href, texto, icono: Icono } = item;
                const activo = href === actual;
                const oculto = ocultos.includes(href);
                if (personalizando) {
                  return sePuedeOcultar(item) ? (
                    <button key={href} type="button" onClick={() => alternarOculto(href)} aria-pressed={!oculto} title={compacto ? texto : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-gray-100 ${oculto ? "text-gray-400" : "text-gray-700"} ${compacto ? "md:justify-center" : ""}`}>
                      <Icono size={18} strokeWidth={1.8} className="shrink-0" /><span className={`flex-1 ${oculto ? "line-through" : ""} ${compacto ? "md:hidden" : ""}`}>{texto}</span>
                      {oculto ? <EyeOff size={16} className={`shrink-0 ${compacto ? "md:hidden" : ""}`} /> : <Eye size={16} className={`shrink-0 text-marca ${compacto ? "md:hidden" : ""}`} />}
                    </button>
                  ) : null;
                }
                const esFavorito = favoritos.includes(href);
                return (
                  <div key={`${g.esFavoritos ? "f" : "g"}-${href}`} className="group relative">
                    <Link href={href} onClick={() => setAbierto(false)} aria-current={activo ? "page" : undefined}
                      title={compacto ? texto : undefined}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${compacto ? "md:justify-center" : "pr-10"} ${activo ? "bg-marca-suave text-marca" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}>
                      <Icono size={18} strokeWidth={activo ? 2.2 : 1.8} className="shrink-0" /><span className={compacto ? "md:hidden" : ""}>{texto}</span>
                      {oculto && <span className="ml-auto text-[11px] font-normal text-gray-400">oculto</span>}
                    </Link>
                    {!compacto && <button type="button" onClick={() => alternarFavorito(href)} aria-pressed={esFavorito} aria-label={esFavorito ? `Sacar ${texto} de favoritos` : `Agregar ${texto} a favoritos`} title={esFavorito ? "Sacar de favoritos" : "Agregar a favoritos"}
                      className={`absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md transition hover:bg-gray-200 focus-visible:opacity-100 ${esFavorito ? "text-amber-500" : "text-gray-400 opacity-100 md:opacity-0 md:group-hover:opacity-100"}`}>
                      <Star size={15} strokeWidth={1.8} className={esFavorito ? "fill-current" : ""} /></button>}
                  </div>
                );
              })}
            </div>
          ))}
          {!grupos.length && <p className="px-3 py-8 text-center text-sm text-texto-2">No encontramos esa sección.</p>}
        </nav>
        {errorMenu && <p role="alert" className="px-4 pb-1 text-xs text-error">No se pudo guardar tu menú. Probá de nuevo.</p>}
        <div className="border-t border-borde px-3 py-3 text-sm">
          <button type="button" onClick={() => setPersonalizando(!personalizando)} aria-pressed={personalizando} title={compacto ? "Personalizar mi menú" : undefined}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 font-medium ${personalizando ? "bg-marca-suave text-marca" : "text-gray-600 hover:bg-gray-100"} ${compacto ? "md:justify-center" : ""}`}>
            {personalizando ? <Check size={18} strokeWidth={2.2} /> : <SlidersHorizontal size={18} strokeWidth={1.8} />}<span className={compacto ? "md:hidden" : ""}>{personalizando ? "Listo" : "Personalizar mi menú"}</span></button>
          <a href="/" target="_blank" title={compacto ? "Ver la tienda" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 ${compacto ? "md:justify-center" : ""}`}>
            <ExternalLink size={18} strokeWidth={1.8} /><span className={compacto ? "md:hidden" : ""}>Ver la tienda</span></a>
          {puede(permisos, "ventas.autorizar") && <Link href="/admin/mi-cuenta" onClick={() => setAbierto(false)} title={compacto ? "Mi PIN de encargado" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 font-medium text-gray-600 hover:bg-gray-100 ${compacto ? "md:justify-center" : ""}`}>
            <LockKeyhole size={18} strokeWidth={1.8} /><span className={compacto ? "md:hidden" : ""}>Mi PIN de encargado</span></Link>}
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
