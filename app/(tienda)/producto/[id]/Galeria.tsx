"use client";
// Fotos del producto en la tienda: se deslizan con el dedo (scroll-snap, sin librerías), con contador y
// miniaturas para saltar a una. En la compu las miniaturas van a un costado. Empieza por la principal.
// Tocar una foto la abre ampliada: con el mouse se recorre moviéndolo, con el dedo se arrastra. Esc o la X la cierran.
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Shirt, X } from "lucide-react";

export default function Galeria({ fotos, nombre }: { fotos: string[]; nombre: string }) {
  const tira = useRef<HTMLDivElement>(null);
  const [actual, setActual] = useState(0);
  const [ampliada, setAmpliada] = useState<number | null>(null);

  if (!fotos.length) return (
    <div className="grid aspect-[4/5] place-items-center rounded-sm bg-marca-suave"><Shirt size={96} strokeWidth={1.2} className="text-gray-300" /></div>
  );

  const ir = (i: number) => tira.current?.scrollTo({ left: Math.max(0, Math.min(i, fotos.length - 1)) * tira.current.clientWidth, behavior: "smooth" });

  return (
    <div className="flex flex-col gap-3 lg:flex-row-reverse">
      <div className="relative min-w-0 flex-1">
        <div ref={tira} data-foto-principal onScroll={(e) => setActual(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="tira flex aspect-[4/5] snap-x snap-mandatory overflow-x-auto overflow-y-hidden rounded-sm bg-marca-suave">
          {fotos.map((url, i) => (
            <img key={url} src={url} alt={`${nombre} (foto ${i + 1} de ${fotos.length})`} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : undefined}
              onClick={() => setAmpliada(i)} className="h-full w-full shrink-0 cursor-zoom-in snap-center object-cover object-top" />
          ))}
        </div>
        <button type="button" onClick={() => setAmpliada(actual)} aria-label="Ampliar la foto" className="absolute bottom-3 right-3 grid h-11 w-11 place-items-center rounded-sm bg-white/90 shadow-sm hover:bg-white"><Maximize2 size={18} /></button>
        {fotos.length > 1 && (
          <>
            <span className="absolute bottom-3 left-3 rounded-sm bg-white px-2.5 py-1 text-xs font-bold" aria-hidden>{actual + 1} / {fotos.length}</span>
            <div className="pointer-events-none absolute inset-y-0 left-0 right-0 hidden items-center justify-between px-2 lg:flex">
              <button type="button" onClick={() => ir(actual - 1)} disabled={actual === 0} aria-label="Foto anterior" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-sm bg-white/90 disabled:opacity-0"><ChevronLeft size={20} /></button>
              <button type="button" onClick={() => ir(actual + 1)} disabled={actual === fotos.length - 1} aria-label="Foto siguiente" className="pointer-events-auto grid h-11 w-11 place-items-center rounded-sm bg-white/90 disabled:opacity-0"><ChevronRight size={20} /></button>
            </div>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div data-lenis-prevent className="tira flex gap-2 overflow-x-auto lg:max-h-[40rem] lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden">
          {fotos.map((url, i) => (
            <button key={url} type="button" onClick={() => ir(i)} aria-label={`Ver foto ${i + 1}`} aria-current={i === actual ? "true" : undefined}
              className={`aspect-[4/5] w-16 shrink-0 overflow-hidden rounded-sm border-2 lg:w-full ${i === actual ? "border-marca" : "border-transparent opacity-60 hover:opacity-100"}`}>
              <img src={url} alt="" className="h-full w-full object-cover object-top" />
            </button>
          ))}
        </div>
      )}
      {ampliada !== null && <Ampliada fotos={fotos} nombre={nombre} inicial={ampliada} alCerrar={(i) => { setAmpliada(null); ir(i); }} />}
    </div>
  );
}

// Visor a pantalla completa (<dialog> nativo: Esc, foco y fondo bloqueado vienen gratis)
function Ampliada({ fotos, nombre, inicial, alCerrar }: { fotos: string[]; nombre: string; inicial: number; alCerrar: (i: number) => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const marco = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(inicial);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { dialogo.current?.showModal(); }, []);

  // Con el mouse, la foto ampliada se recorre moviéndolo (con el dedo se arrastra, el marco hace scroll)
  const recorrer = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = marco.current;
    if (!m || !zoom || e.pointerType !== "mouse") return;
    const r = m.getBoundingClientRect();
    m.scrollLeft = ((e.clientX - r.left) / r.width) * (m.scrollWidth - m.clientWidth);
    m.scrollTop = ((e.clientY - r.top) / r.height) * (m.scrollHeight - m.clientHeight);
  };
  const mover = (d: number) => { setI((x) => Math.max(0, Math.min(x + d, fotos.length - 1))); setZoom(false); };

  return (
    <dialog ref={dialogo} onClose={() => alCerrar(i)} data-lenis-prevent
      onKeyDown={(e) => { if (e.key === "ArrowLeft") mover(-1); if (e.key === "ArrowRight") mover(1); }}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-black/95 p-0 text-white backdrop:bg-black">
      <div key={i} ref={marco} onPointerMove={recorrer} onClick={() => setZoom((z) => !z)}
        className={`tira h-full w-full ${zoom ? "overflow-auto cursor-zoom-out" : "grid place-items-center overflow-hidden cursor-zoom-in"}`}>
        <img src={fotos[i]} alt={`${nombre} (foto ${i + 1} de ${fotos.length}, ampliada)`}
          className={zoom ? "block max-w-none" : "max-h-full max-w-full object-contain"} style={zoom ? { width: "max(160vw, 160vh * 0.8)" } : undefined} />
      </div>
      <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="absolute right-3 top-3 grid h-12 w-12 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25"><X size={22} /></button>
      {fotos.length > 1 && (
        <>
          <span className="pointer-events-none absolute left-1/2 top-5 -translate-x-1/2 text-sm font-semibold" aria-hidden>{i + 1} / {fotos.length}</span>
          <button type="button" onClick={() => mover(-1)} disabled={i === 0} aria-label="Foto anterior" className="absolute left-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 disabled:opacity-0"><ChevronLeft size={22} /></button>
          <button type="button" onClick={() => mover(1)} disabled={i === fotos.length - 1} aria-label="Foto siguiente" className="absolute right-3 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/15 backdrop-blur hover:bg-white/25 disabled:opacity-0"><ChevronRight size={22} /></button>
        </>
      )}
    </dialog>
  );
}
