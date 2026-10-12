"use client";
// Fila que se desliza: con el dedo en el celular (scroll-snap nativo) y con flechas en la compu.
// Las flechas se apagan en los extremos y una barrita muestra cuánto falta ver.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function Carrusel({ children, etiqueta, oscuro = false }: { children: React.ReactNode; etiqueta: string; oscuro?: boolean }) {
  const fila = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ inicio: true, fin: false, avance: 0 });

  useEffect(() => {
    const el = fila.current;
    if (!el) return;
    const medir = () => {
      const max = el.scrollWidth - el.clientWidth;
      setPos({ inicio: el.scrollLeft <= 4, fin: el.scrollLeft >= max - 4, avance: max > 0 ? el.scrollLeft / max : 1 });
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    return () => { el.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); };
  }, []);

  // Avanza casi una pantalla, así siempre queda a la vista una tarjeta de la tanda anterior
  const mover = (dir: 1 | -1) => fila.current?.scrollBy({ left: dir * fila.current.clientWidth * 0.85, behavior: "smooth" });
  const flecha = `grid h-12 w-12 place-items-center rounded-full border transition disabled:opacity-25 ${oscuro ? "border-white/40 hover:bg-white hover:text-marca" : "border-marca hover:bg-marca hover:text-white"}`;

  return (
    <div className="space-y-5">
      <div ref={fila} role="region" aria-label={etiqueta} tabIndex={0}
        className="tira sangrado flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 sm:gap-5 sm:px-6 lg:px-[max(1.5rem,calc(50vw-40rem+1.5rem))] [&>*]:snap-start [&>*]:scroll-ml-4 sm:[&>*]:scroll-ml-6 lg:[&>*]:scroll-ml-[max(1.5rem,calc(50vw-40rem+1.5rem))]">
        {children}
      </div>
      <div className="flex items-center gap-5">
        <div className={`h-0.5 flex-1 overflow-hidden rounded-full ${oscuro ? "bg-white/20" : "bg-borde"}`} aria-hidden>
          <div className={`h-full origin-left rounded-full transition-transform duration-300 ${oscuro ? "bg-white" : "bg-marca"}`}
            style={{ transform: `scaleX(${Math.max(0.12, pos.avance)})` }} />
        </div>
        <div className="hidden gap-2 sm:flex">
          <button type="button" onClick={() => mover(-1)} disabled={pos.inicio} aria-label="Anteriores" className={flecha}><ArrowLeft size={20} strokeWidth={1.8} /></button>
          <button type="button" onClick={() => mover(1)} disabled={pos.fin} aria-label="Siguientes" className={flecha}><ArrowRight size={20} strokeWidth={1.8} /></button>
        </div>
      </div>
    </div>
  );
}
