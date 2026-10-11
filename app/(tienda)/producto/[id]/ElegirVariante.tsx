"use client";
import Link from "next/link";
import { useState } from "react";
import { useCarrito } from "@/lib/carrito";
import { pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, type MedioPago } from "@/lib/medios";
import { ChevronRight, CircleCheck } from "lucide-react";

type V = { variante_id: number; producto_id: number; nombre: string; talle: string; color: string; color_hex: string | null; precio: number; disponible: number };

export default function ElegirVariante({ variantes: todas, mejorMedio }: { variantes: V[]; mejorMedio: MedioPago | null }) {
  // Solo se ofrece lo que se puede comprar: un talle sin stock no aparece,
  // y un color que se quedó sin ningún talle tampoco.
  const variantes = todas.filter((v) => v.disponible > 0);
  const colores = [...new Map(variantes.map((v) => [v.color, v.color_hex])).entries()];
  const [color, setColor] = useState(colores[0]?.[0] ?? "");
  const [elegida, setElegida] = useState<V | null>(null);
  const [agregado, setAgregado] = useState(false);
  const { agregar } = useCarrito();

  if (!variantes.length) return (
    <div className="space-y-2">
      <div className="text-2xl font-bold">{pesos(Math.min(...todas.map((v) => Number(v.precio))))}</div>
      <p className="rounded-lg bg-gray-100 p-3 text-sm text-texto-2">Sin stock por ahora. Escribinos y te avisamos cuando vuelva.</p>
    </div>
  );

  const delColor = variantes.filter((v) => v.color === color);
  const precio = elegida?.precio ?? Math.min(...delColor.map((v) => Number(v.precio)));

  return (
    <div className="space-y-4">
      <div><div className="text-2xl font-bold">{pesos(precio)}</div>
        {mejorMedio && <div className="text-sm font-semibold text-ok">{pesos(precio + ajusteDe(precio, mejorMedio.ajuste_pct))} pagando con {mejorMedio.nombre.toLowerCase()} ({porcentaje(mejorMedio.ajuste_pct)})</div>}</div>
      <div><div className="etiqueta">Color: {color}</div>
        <div className="flex gap-2">{colores.map(([c, hex]) => (
          <button key={c} type="button" title={c} onClick={() => { setColor(c); setElegida(null); setAgregado(false); }}
            className={`h-9 w-9 rounded-full border-2 ${c === color ? "border-marca" : "border-gray-200"}`} style={{ background: hex ?? "#ddd" }} />
        ))}</div></div>
      <div><div className="etiqueta">Talle</div>
        <div className="flex flex-wrap gap-2">{delColor.map((v) => (
          <button key={v.variante_id} type="button" onClick={() => { setElegida(v); setAgregado(false); }}
            className={`min-w-12 rounded-lg border px-3 py-2 font-semibold ${elegida?.variante_id === v.variante_id ? "border-marca bg-marca text-white" : "border-borde bg-white hover:border-marca"}`}>
            {v.talle}</button>
        ))}</div>
        {elegida && elegida.disponible <= 2 && <p className="mt-1 text-sm text-alerta">¡Quedan {elegida.disponible}!</p>}</div>
      <button className="boton w-full py-3 text-base" disabled={!elegida}
        onClick={() => { if (elegida) { agregar({ ...elegida, precio: Number(elegida.precio) }); setAgregado(true); } }}>
        {elegida ? "Agregar al carrito" : "Elegí un talle"}</button>
      {agregado && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> Agregado. <Link href="/carrito" className="inline-flex items-center gap-0.5 font-semibold text-marca">Ir al carrito <ChevronRight size={15} /></Link></p>}
    </div>
  );
}
