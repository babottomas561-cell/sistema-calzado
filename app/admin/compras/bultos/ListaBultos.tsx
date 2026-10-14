"use client";
// Los bultos guardados, con lo que lleva cada uno. Se quitan desde acá; se arman cargando una compra.
import { useState, useTransition } from "react";
import { Boxes, Trash2 } from "lucide-react";
import { quitarBulto } from "../acciones";

export type Bulto = { id: number; nombre: string; proveedor: string | null; items: { texto: string; cantidad: number }[] };

export default function ListaBultos({ bultos }: { bultos: Bulto[] }) {
  const [error, setError] = useState("");
  const [ocupado, empezar] = useTransition();
  if (!bultos.length) return <div className="rounded-xl border border-dashed border-borde p-8 text-center text-sm text-texto-2">Todavía no hay bultos. Cargá una compra por curva y tocá «Guardar lo cargado como bulto».</div>;
  return (
    <div className={`space-y-3 ${ocupado ? "opacity-60" : ""}`}>
      {bultos.map((b) => (
        <section key={b.id} className="tarjeta space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="flex items-center gap-2 font-semibold"><Boxes size={16} strokeWidth={1.8} className="text-marca" /> {b.nombre}</h2>
              <p className="text-xs text-texto-2">{b.items.reduce((t, i) => t + i.cantidad, 0)} unidades{b.proveedor ? ` · ${b.proveedor}` : ""}</p></div>
            <button type="button" aria-label={`Quitar ${b.nombre}`} disabled={ocupado} className="text-texto-2 hover:text-error"
              onClick={() => confirm(`¿Quitar el bulto «${b.nombre}»? Las compras ya cargadas no cambian.`) && empezar(async () => { const r = await quitarBulto(b.id); setError(r.error ?? ""); })}><Trash2 size={17} strokeWidth={1.8} /></button>
          </div>
          <ul className="grid gap-x-6 gap-y-0.5 text-sm sm:grid-cols-2">
            {b.items.map((i, k) => <li key={k} className="flex justify-between gap-2"><span className="truncate">{i.texto}</span><b className="tabular-nums">{i.cantidad}</b></li>)}
          </ul>
        </section>
      ))}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
    </div>
  );
}
