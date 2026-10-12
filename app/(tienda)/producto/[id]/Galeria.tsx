"use client";
// Fotos del producto en la tienda: se deslizan con el dedo (scroll-snap, sin librerías)
// y abajo van las miniaturas para saltar a una. Empieza por la principal.
import { useRef, useState } from "react";
import { Shirt } from "lucide-react";

export default function Galeria({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const tira = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);

  if (!fotos.length) return (
    <div className="grid aspect-square place-items-center rounded-2xl bg-gray-100"><Shirt size={120} className="text-gray-300" /></div>
  );

  const ir = (i: number) => tira.current?.scrollTo({ left: i * tira.current.clientWidth, behavior: "smooth" });

  return (
    <div className="space-y-2">
      <div ref={tira} onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex aspect-square snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-2xl bg-gray-100 [scrollbar-width:none]">
        {fotos.map((url, i) => (
          <img key={url} src={url} alt={`${nombre} (${i + 1} de ${fotos.length})`} loading={i === 0 ? "eager" : "lazy"}
            className="h-full w-full shrink-0 snap-center object-cover" />
        ))}
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {fotos.map((url, i) => (
            <button key={url} type="button" onClick={() => ir(i)} aria-label={`Ver foto ${i + 1}`}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === actual ? "border-marca" : "border-transparent opacity-70"}`}>
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
