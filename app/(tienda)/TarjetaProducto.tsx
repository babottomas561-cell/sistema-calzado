// Tarjeta de un modelo en el catálogo: foto vertical (con una segunda al pasar el mouse), marca, nombre,
// precio y colores disponibles. Sobre la foto: la promoción o «Nuevo»; en la compu, al pasar el mouse, los talles que hay.
import Link from "next/link";
import { Shirt } from "lucide-react";
import { esReciente, pesos } from "@/lib/formato";

export type Modelo = {
  id: number; nombre: string; marca: string | null; categoria: string | null; imagen: string | null; imagen2: string | null;
  precio: number; colores: { nombre: string; hex: string | null }[]; disponible: number; etiqueta: string | null;
  talles?: string[];          // los talles que hay para vender, en su orden
  creado?: string | null;     // cuándo se publicó (para el cartelito «Nuevo»)
};

const ULTIMAS = 3;   // con tan pocas unidades se avisa «Quedan N»

export default function TarjetaProducto({ m, prioridad = false }: { m: Modelo; prioridad?: boolean }) {
  const agotado = m.disponible <= 0;
  const quedan = !agotado && m.disponible <= ULTIMAS ? m.disponible : null;
  const nuevo = !agotado && !m.etiqueta && esReciente(m.creado);
  const talles = m.talles ?? [];
  const zoom = "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-[1.04]";
  return (
    <Link href={`/producto/${m.id}`} className="aparece group block" aria-label={`${m.nombre}, ${pesos(m.precio)}${agotado ? ", sin stock" : quedan ? `, quedan ${quedan}` : ""}`}>
      <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-marca-suave">
        {m.imagen
          ? <img src={m.imagen} alt="" loading={prioridad ? "eager" : "lazy"} decoding="async"
              className={`absolute inset-0 h-full w-full object-cover object-top ${zoom} ${agotado ? "opacity-50" : ""} ${m.imagen2 ? "group-hover:opacity-0" : ""}`} />
          : <span className="absolute inset-0 grid place-items-center text-gray-300"><Shirt size={48} strokeWidth={1.4} /></span>}
        {m.imagen2 && <img src={m.imagen2} alt="" loading="lazy" decoding="async" className={`absolute inset-0 h-full w-full object-cover object-top opacity-0 group-hover:opacity-100 ${zoom}`} />}
        {m.etiqueta && !agotado && <span className="absolute left-2 top-2 rounded-sm bg-acento px-2 py-1 text-xs font-bold leading-none text-white">{m.etiqueta}</span>}
        {nuevo && <span className="absolute left-2 top-2 rounded-sm bg-white px-2 py-1 text-xs font-bold leading-none text-marca">Nuevo</span>}
        {agotado && <span className="absolute left-2 top-2 rounded-sm bg-white px-2 py-1 text-xs font-bold leading-none">Sin stock</span>}
        {/* Solo con mouse: los talles que hay, sin entrar a la ficha */}
        {talles.length > 0 && !agotado && (
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 hidden translate-y-full bg-white/95 px-3 py-2.5 text-[0.75rem] font-semibold leading-snug backdrop-blur-sm transition-transform duration-300 ease-out motion-reduce:transition-none [@media(hover:hover)]:block [@media(hover:hover)]:group-hover:translate-y-0">
            <span className="mr-1.5 text-texto-2">Talles</span>{talles.slice(0, 9).join("  ·  ")}{talles.length > 9 ? "  ·  …" : ""}
          </span>
        )}
      </div>
      <div className="mt-3 space-y-1">
        <p className="truncate text-[0.78rem] font-semibold text-texto-2">{m.marca ?? m.categoria}</p>
        <p className="line-clamp-2 text-[0.95rem] font-semibold leading-snug group-hover:underline group-hover:underline-offset-4">{m.nombre}</p>
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <p className="font-bold">{pesos(m.precio)}{quedan !== null && <span className="ml-2 text-xs font-semibold text-alerta">Quedan {quedan}</span>}</p>
          {m.colores.length > 0 && (
            <p className="flex items-center gap-1" aria-label={`Colores: ${m.colores.map((c) => c.nombre).join(", ")}`}>
              {m.colores.slice(0, 4).map((c) => <span key={c.nombre} className="h-3.5 w-3.5 rounded-full border border-black/15" style={{ background: c.hex ?? "#ddd" }} />)}
              {m.colores.length > 4 && <span className="text-xs text-texto-2">+{m.colores.length - 4}</span>}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
