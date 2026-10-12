"use client";
// Lista de productos con selección múltiple: se tildan varios y se mandan juntos a imprimir etiquetas (un lote de una sola vez).
// En el celular, tarjetas; en la compu, tabla. El nombre sigue llevando a la ficha del artículo.
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Printer } from "lucide-react";
import { numero, pesos } from "@/lib/formato";

export type FilaProducto = {
  id: number; codigo: string; nombre: string; marca: string | null; categoria: string | null; genero: string | null;
  precio_venta: number; activo: boolean; publicado_web: boolean; unidades: number;
};

export default function ListaProductos({ productos, vacio, puedeEtiquetar }: { productos: FilaProducto[]; vacio: string; puedeEtiquetar: boolean }) {
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const todos = productos.length > 0 && elegidos.size === productos.length;
  const alternar = (id: number) => setElegidos((e) => { const n = new Set(e); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const alternarTodos = () => setElegidos(todos ? new Set() : new Set(productos.map((p) => p.id)));
  const enlace = `/admin/etiquetas?productos=${[...elegidos].slice(0, 800).join(",")}`;

  const casilla = (p: FilaProducto) => puedeEtiquetar && (
    <input type="checkbox" checked={elegidos.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Elegir ${p.nombre}`} className="h-4 w-4 shrink-0" />
  );
  const fichas = (p: FilaProducto) => (
    <>{!p.activo && <span className="chip bg-gray-100 text-texto-2">inactivo</span>}{p.publicado_web && <span className="chip bg-blue-50 text-marca">en la tienda</span>}</>
  );
  const unidades = (p: FilaProducto) => <span className={`chip ${p.unidades === 0 ? "bg-red-100 text-error" : "bg-gray-100"}`}>{numero(p.unidades)} {p.unidades === 1 ? "unidad" : "unidades"}</span>;

  return (
    <>
      {/* Celular */}
      <div className="tarjeta divide-y divide-gray-100 p-0 md:hidden">
        {puedeEtiquetar && productos.length > 0 && (
          <label className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-texto-2"><input type="checkbox" checked={todos} onChange={alternarTodos} className="h-4 w-4" /> Elegir todos ({productos.length})</label>
        )}
        {productos.map((p) => (
          <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${p.activo ? "" : "opacity-50"}`}>
            {casilla(p)}
            <Link href={`/admin/productos/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 active:bg-gray-50">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{p.nombre}</div>
                <div className="truncate text-xs text-texto-2"><span className="font-mono">{p.codigo}</span>{p.marca ? ` · ${p.marca}` : ""} · {pesos(p.precio_venta)}</div>
                <div className="mt-1 flex flex-wrap gap-1">{fichas(p)}</div>
              </div>
              <div className="shrink-0 text-right text-sm">{unidades(p)}</div>
              <ChevronRight size={16} className="shrink-0 text-gray-300" />
            </Link>
          </div>
        ))}
        {productos.length === 0 && <p className="py-8 text-center text-sm text-texto-2">{vacio}</p>}
      </div>

      {/* Compu */}
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr>
            {puedeEtiquetar && <th className="w-10"><input type="checkbox" checked={todos} onChange={alternarTodos} aria-label="Elegir todos" className="h-4 w-4" /></th>}
            <th>Código</th><th>Modelo</th><th>Marca</th><th>Categoría</th><th className="text-right">Precio</th><th className="text-right">Stock</th></tr></thead>
          <tbody>
            {productos.map((p) => (
              <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                {puedeEtiquetar && <td>{casilla(p)}</td>}
                <td className="font-mono text-xs">{p.codigo}</td>
                <td><Link href={`/admin/productos/${p.id}`} className="font-semibold text-marca hover:underline">{p.nombre}</Link>
                  {!p.activo && <span className="chip ml-2 bg-gray-100 text-texto-2">inactivo</span>}
                  {p.publicado_web && <span className="chip ml-2 bg-blue-50 text-marca">en la tienda</span>}</td>
                <td>{p.marca ?? "—"}</td>
                <td>{p.categoria ?? "—"}{p.genero ? ` · ${p.genero}` : ""}</td>
                <td className="text-right">{pesos(p.precio_venta)}</td>
                <td className="text-right">{unidades(p)}</td>
              </tr>
            ))}
            {productos.length === 0 && <tr><td colSpan={puedeEtiquetar ? 7 : 6} className="py-8 text-center text-texto-2">{vacio}</td></tr>}
          </tbody>
        </table>
      </div>

      {puedeEtiquetar && elegidos.size > 0 && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-white p-3 shadow-lg" role="region" aria-label="Acciones sobre lo elegido">
          <p className="text-sm"><b>{elegidos.size}</b> {elegidos.size === 1 ? "producto elegido" : "productos elegidos"}</p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setElegidos(new Set())} className="text-sm font-semibold text-texto-2">Quitar la selección</button>
            <Link href={enlace} className="boton"><Printer size={16} strokeWidth={1.8} /> Imprimir etiquetas</Link>
          </div>
        </div>
      )}
    </>
  );
}
