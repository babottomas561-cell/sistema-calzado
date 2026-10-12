"use client";
// Buscar un modelo y elegir talle + color. Lo usan "Nueva venta" y "Nueva compra".
import { useMemo, useState } from "react";
import { ChevronLeft, Search } from "lucide-react";
import { pesos } from "@/lib/formato";

export type FilaStock = {
  variante_id: number; producto_id: number; nombre: string; marca: string | null;
  talle: string; talle_orden?: number; color: string; sku: string | null; stock: number; precio_venta: number; precio_compra: number;
};

// Orden real del talle (viene de la tabla de talles); si no viene, numérico y después texto
const ordenTalle = (a: FilaStock, b: FilaStock) =>
  (Number(a.talle_orden ?? a.talle) || 999) - (Number(b.talle_orden ?? b.talle) || 999) || a.talle.localeCompare(b.talle);

export default function SelectorVariantes({ filas: todas, alElegir, soloConStock }: {
  filas: FilaStock[]; alElegir: (f: FilaStock) => void; soloConStock: boolean;
}) {
  // Al vender, lo que no tiene stock disponible directamente no aparece (ni el talle, ni el color,
  // ni el modelo si se quedó sin nada). Al comprar se ven todos: justamente es para reponer.
  const filas = useMemo(() => (soloConStock ? todas.filter((f) => f.stock > 0) : todas), [todas, soloConStock]);
  const [busqueda, setBusqueda] = useState("");
  const [productoId, setProductoId] = useState<number | null>(null);

  const productos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<number, { id: number; nombre: string; marca: string | null; stock: number }>();
    for (const f of filas) {
      const coincide = !q || f.nombre.toLowerCase().includes(q) || (f.marca ?? "").toLowerCase().includes(q) || (f.sku ?? "").toLowerCase().startsWith(q);
      if (!coincide) continue;
      const p = mapa.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, stock: 0 };
      p.stock += f.stock;
      mapa.set(f.producto_id, p);
    }
    return [...mapa.values()].slice(0, 12);
  }, [filas, busqueda]);

  // Si se escanea/tipea un SKU exacto, se agrega directo
  const porSku = (texto: string) => filas.find((f) => f.sku && f.sku.toLowerCase() === texto.trim().toLowerCase());

  const variantes = filas.filter((f) => f.producto_id === productoId).sort((a, b) => ordenTalle(a, b) || a.color.localeCompare(b.color));
  const colores = [...new Set(variantes.map((v) => v.color))];

  return (
    <div className="space-y-3">
      <div className="relative">
      <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input value={busqueda} autoFocus placeholder="Buscar modelo, marca o código…" className="campo pl-9"
        onChange={(e) => { setBusqueda(e.target.value); setProductoId(null); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            const f = porSku(busqueda);
            if (f) { alElegir(f); setBusqueda(""); }
          }
        }} />
      </div>

      {productoId === null ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {productos.map((p) => (
            <button key={p.id} type="button" onClick={() => setProductoId(p.id)}
              className="rounded-lg border border-borde bg-white p-3 text-left hover:border-marca">
              <div className="font-semibold">{p.nombre}</div>
              <div className="text-xs text-texto-2">{p.marca ?? ""} · {p.stock} unidades</div>
            </button>
          ))}
          {productos.length === 0 && <p className="text-sm text-texto-2">{soloConStock ? "No hay nada con stock que coincida." : "No se encontró nada."}</p>}
        </div>
      ) : (
        <div className="rounded-lg border border-borde bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <b>{variantes[0]?.nombre}</b>
            <button type="button" onClick={() => setProductoId(null)} className="inline-flex items-center gap-0.5 text-sm font-medium text-marca"><ChevronLeft size={15} /> otro modelo</button>
          </div>
          {colores.map((color) => (
            <div key={color} className="mb-2">
              <div className="etiqueta">{color}</div>
              <div className="flex flex-wrap gap-2">
                {variantes.filter((v) => v.color === color).map((v) => {
                  return (
                    <button key={v.variante_id} type="button" onClick={() => alElegir(v)}
                      className="min-w-14 rounded-lg border border-borde bg-white px-3 py-2 text-sm hover:border-marca hover:bg-marca-suave">
                      <div className="font-bold">{v.talle}</div>
                      <div className="text-[11px] text-texto-2">{v.stock} disp.</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-texto-2">Precio: {pesos(variantes[0]?.precio_venta)} · costo {pesos(variantes[0]?.precio_compra)}</p>
        </div>
      )}
    </div>
  );
}
