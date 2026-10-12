"use client";
// Selector de orden del catálogo: cambia la dirección con el parámetro ?orden= (sin recargar todo a mano).
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

export default function OrdenSelect({ opciones, actual }: { opciones: { valor: string; texto: string; href: string }[]; actual: string }) {
  const router = useRouter();
  return (
    <label className="relative inline-flex min-h-11 items-center">
      <span className="sr-only">Ordenar por</span>
      <select value={actual} onChange={(e) => router.push(opciones.find((o) => o.valor === e.target.value)!.href, { scroll: false })}
        className="h-11 cursor-pointer appearance-none rounded-sm border border-gray-300 bg-white pl-3.5 pr-10 text-sm font-semibold hover:border-marca">
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3" aria-hidden />
    </label>
  );
}
