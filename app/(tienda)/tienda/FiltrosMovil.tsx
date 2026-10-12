"use client";
// Filtros en el celular: un botón que abre un panel de pantalla completa (dialog nativo, con foco y Escape).
// El panel queda abierto mientras se tocan filtros (cada uno es un enlace) y se cierra con "Ver N prendas".
import { useRef } from "react";
import { SlidersHorizontal, X } from "lucide-react";

export default function FiltrosMovil({ cantidad, total, children }: { cantidad: number; total: number; children: React.ReactNode }) {
  const panel = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => panel.current?.showModal()} className="inline-flex h-11 items-center gap-2 rounded-sm border border-marca bg-white px-4 text-sm font-bold">
        <SlidersHorizontal size={17} /> Filtrar{cantidad > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-marca px-1.5 text-xs text-white">{cantidad}</span>}
      </button>
      <dialog ref={panel} aria-label="Filtros" className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 open:flex open:flex-col sm:m-auto sm:h-[85dvh] sm:max-w-md sm:rounded-sm">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-borde px-5">
          <h2 className="text-lg font-extrabold">Filtrar</h2>
          <button type="button" onClick={() => panel.current?.close()} aria-label="Cerrar filtros" className="grid h-11 w-11 place-items-center rounded-sm hover:bg-marca-suave"><X size={22} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="shrink-0 border-t border-borde p-4">
          <button type="button" onClick={() => panel.current?.close()} className="boton w-full">Ver {total} {total === 1 ? "prenda" : "prendas"}</button>
        </div>
      </dialog>
    </>
  );
}
