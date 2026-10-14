"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useCarrito } from "@/lib/carrito";
import { pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, type MedioPago } from "@/lib/medios";
import { volarAlCarrito } from "@/lib/volar-al-carrito";
import { Check, ChevronRight, ShoppingBag } from "lucide-react";

type V = { variante_id: number; producto_id: number; nombre: string; talle: string; color: string; color_hex: string | null; precio: number; disponible: number };

export default function ElegirVariante({ variantes: todas, mejorMedio, imagen }: { variantes: V[]; mejorMedio: MedioPago | null; imagen?: string | null }) {
  // Solo se ofrece lo que se puede comprar: un talle sin stock no aparece,
  // y un color que se quedó sin ningún talle tampoco.
  const variantes = todas.filter((v) => v.disponible > 0);
  const colores = [...new Map(variantes.map((v) => [v.color, v.color_hex])).entries()];
  const [color, setColor] = useState(colores[0]?.[0] ?? "");
  const [elegida, setElegida] = useState<V | null>(null);
  const [agregado, setAgregado] = useState(false);
  const { agregar } = useCarrito();
  const boton = useRef<HTMLButtonElement>(null);

  if (!variantes.length) return (
    <div className="space-y-3">
      <p className="text-2xl font-extrabold">{pesos(Math.min(...todas.map((v) => Number(v.precio))))}</p>
      <p className="rounded-sm bg-marca-suave p-4 text-sm text-texto-2">Se agotó por ahora. Escribinos y te chiflamos cuando vuelva.</p>
    </div>
  );

  const delColor = variantes.filter((v) => v.color === color);
  const precio = elegida?.precio ?? Math.min(...delColor.map((v) => Number(v.precio)));
  const conMedio = mejorMedio ? precio + ajusteDe(precio, mejorMedio.ajuste_pct) : null;
  const agregarAlCarrito = () => { if (elegida) { agregar({ ...elegida, precio: Number(elegida.precio), imagen_url: imagen ?? null }); setAgregado(true);
    // La foto vuela al carrito (si no hay foto a la vista, sale del botón)
    void volarAlCarrito(document.querySelector("[data-foto-principal]"), imagen ?? null, boton.current); } };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[1.75rem] font-extrabold leading-none tracking-[-0.03em]">{pesos(precio)}</p>
        {conMedio !== null && mejorMedio && <p className="mt-2 text-sm font-semibold text-ok">{pesos(conMedio)} pagando con {mejorMedio.nombre.toLowerCase()} ({porcentaje(mejorMedio.ajuste_pct)})</p>}
      </div>

      <fieldset>
        <legend className="mb-2.5 text-sm"><span className="font-bold">Color</span> <span className="text-texto-2">{color}</span></legend>
        <div className="flex flex-wrap gap-2.5">{colores.map(([c, hex]) => (
          <button key={c} type="button" aria-label={c} aria-pressed={c === color} title={c}
            onClick={() => { setColor(c); setElegida(null); setAgregado(false); }}
            className={`grid h-11 w-11 place-items-center rounded-full border-2 p-0.5 ${c === color ? "border-marca" : "border-transparent hover:border-gray-300"}`}>
            <span className="block h-full w-full rounded-full border border-black/15" style={{ background: hex ?? "#ddd" }} />
          </button>
        ))}</div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 flex w-full items-baseline justify-between text-sm"><span className="font-bold">Talle</span>
          {elegida && elegida.disponible <= 2 && <span className="font-semibold text-alerta">¡Quedan {elegida.disponible}!</span>}</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{delColor.map((v) => (
          <button key={v.variante_id} type="button" aria-pressed={elegida?.variante_id === v.variante_id}
            onClick={() => { setElegida(v); setAgregado(false); }}
            className={`h-12 rounded-sm border text-[0.95rem] font-semibold ${elegida?.variante_id === v.variante_id ? "border-marca bg-marca text-white" : "border-gray-300 hover:border-marca"}`}>
            {v.talle}</button>
        ))}</div>
      </fieldset>

      {/* En el celular la compra queda fija abajo, al alcance del pulgar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-borde bg-white px-4 py-3 lg:static lg:border-0 lg:p-0">
        <button ref={boton} className="boton w-full" disabled={!elegida} onClick={agregarAlCarrito}>
          <ShoppingBag size={19} /> {elegida ? `Agregar al carrito · ${pesos(elegida.precio)}` : "Elegí tu talle"}</button>
      </div>
      <div role="status" aria-live="polite">
        {agregado && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-marca-suave px-4 py-3 text-sm"><span className="inline-flex items-center gap-1.5 font-bold text-ok"><Check size={16} /> Listo, ya está en el carrito</span>
          <Link href="/carrito" className="inline-flex min-h-11 items-center gap-0.5 font-bold underline underline-offset-4">Ir al carrito <ChevronRight size={15} /></Link></p>}
      </div>
    </div>
  );
}
