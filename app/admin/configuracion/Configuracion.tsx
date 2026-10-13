"use client";
// Tarjetas de Configuración por sección, con buscador (sin tildes ni mayúsculas) y el estado de cada una.
import Link from "next/link";
import { useMemo, useState } from "react";
import { BookText, CircleCheck, CircleDot, Package, Plug, Search, ShieldCheck, ShoppingBag, Store, UserRound, Receipt, X, type LucideIcon } from "lucide-react";

type Entrada = { titulo: string; descripcion: string; href: string; seccion: string; palabras: string; listo: boolean | null; nota: string | null };

const ICONO: Record<string, LucideIcon> = { Negocio: Store, "Equipo y permisos": ShieldCheck, "Ventas y caja": Receipt, "Catálogo": Package, "Tienda online": ShoppingBag, "Integraciones": Plug, Contabilidad: BookText, "Mi cuenta": UserRound };
const normalizar = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function Configuracion({ entradas, secciones }: { entradas: Entrada[]; secciones: string[] }) {
  const [q, setQ] = useState("");
  const texto = normalizar(q.trim());
  const filtradas = useMemo(() => (texto ? entradas.filter((e) => texto.split(/\s+/).every((p) => normalizar(`${e.titulo} ${e.descripcion} ${e.seccion} ${e.palabras}`).includes(p))) : entradas), [entradas, texto]);
  const faltan = entradas.filter((e) => e.listo === false);

  return (
    <div className="space-y-5">
      <label className="relative block max-w-xl">
        <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <span className="sr-only">Buscar en la configuración</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: logo, impresora, PIN, dominio…" className="campo h-12 pl-10 pr-10 text-base" autoFocus />
        {q && <button type="button" onClick={() => setQ("")} aria-label="Borrar la búsqueda" className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-md text-gray-500 hover:bg-gray-100"><X size={17} /></button>}
      </label>

      {!texto && faltan.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Falta configurar:</b> {faltan.map((e, i) => <span key={e.href + e.titulo}>{i > 0 ? " · " : ""}<Link href={e.href} className="underline">{e.titulo}</Link></span>)}
        </p>
      )}

      {secciones.map((s) => {
        const items = filtradas.filter((e) => e.seccion === s);
        if (!items.length) return null;
        const Icono = ICONO[s] ?? Store;
        return (
          <section key={s} className="space-y-2">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400"><Icono size={14} strokeWidth={1.8} /> {s}</h2>
            <div className="grid gap-2.5 sm:grid-cols-2">
              {items.map((e) => (
                <Link key={e.href + e.titulo} href={e.href} className="tarjeta flex items-start gap-3 transition hover:border-marca">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{e.titulo}</span>
                    <span className="block text-sm text-texto-2">{e.descripcion}</span>
                    {e.nota && <span className="mt-1 block text-xs font-medium text-texto-2">{e.nota}</span>}
                  </span>
                  {e.listo === true && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ok"><CircleCheck size={14} /> Listo</span>}
                  {e.listo === false && <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-alerta"><CircleDot size={14} /> Falta</span>}
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      {filtradas.length === 0 && <p className="rounded-xl border border-dashed border-borde px-4 py-10 text-center text-sm text-texto-2">No encontramos nada para «{q}». Probá con otra palabra.</p>}
    </div>
  );
}
