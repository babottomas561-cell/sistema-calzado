"use client";
// Fotos del producto en la tienda: se deslizan con el dedo (scroll-snap, sin librerías), con contador y
// miniaturas para saltar a una. En la compu las miniaturas van a un costado. Empieza por la principal.
import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Shirt } from "lucide-react";

export default function Galeria({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const tira = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  if (!fotos.length) return (
    <div className="grid aspect-[4/5] place-items-center rounded-sm bg-marca-suave"><Shirt size={96} strokeWidth={1.2} className="text-gray-300" /></div>
  );

  const ir = (i: number) => tira.current?.scrollTo({ left: Math.max(0, Math.min(i, fotos.length - 1)) * tira.current.clientWidth, behavior: "smooth" });

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative min-w-0 flex-1">
        <div ref={tira} onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="tira flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-sm bg-marca-suave">
          {fotos.map((url, i) => (
            <img key={url} src={url} alt={`${nombre} (foto ${i + 1} de ${fotos.length})`} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined}
              className="h-full w-full shrink-0 snap-center object-cover object-top" />
          ))}
        </div>
        {fotos.length > 1 && (
          <>
            <span className="absolute bottom-3 left-3 rounded-sm bg-white px-2.5 py-1 text-xs font-bold" aria-hidden>{actual + 1} / {fotos.length}</span>
            <div className="absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-2 lg:flex">
              <button type="button" onClick={() => ir(actual - 1)} disabled={actual === 0} aria-label="Foto anterior" className="grid h-11 w-11 place-items-center rounded-sm bg-white/90 disabled:opacity-0"><ChevronLeft size={20} /></button>
              <button type="button" onClick={() => ir(actual + 1)} disabled={actual === fotos.length - 1} aria-label="Foto siguiente" className="grid h-11 w-11 place-items-center rounded-sm bg-white/90 disabled:opacity-0"><ChevronRight size={20} /></button>
            </div>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="tira flex gap-2 overflow-x-auto lg:max-h-[40rem] lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          {fotos.map((url, i) => (
            <button key={url} type="button" onClick={() => ir(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual ? "true" : undefined}
              className={`aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-sm border-2 lg:w-full ${i === actual ? "border-marca" : "border-transparent opacity-60 hover:opacity-100"}`}>
              <img src={url} alt="" className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
