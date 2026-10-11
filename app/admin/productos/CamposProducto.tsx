"use client";
// Campos del producto. Marca, rubro y subrubro se ELIGEN de las tablas (no se escriben),
// así no aparecen "Nike" y "nike" como dos marcas. Las altas se hacen en Tablas.
import Link from "next/link";
import { useState } from "react";

export type Opcion = { id: number; codigo: string; nombre: string };
export type Subrubro = Opcion & { categoria_id: number };
export type Maestros = { marcas: Opcion[]; categorias: Opcion[]; subcategorias: Subrubro[] };

type P = { codigo?: string; nombre?: string; marca_id?: number | null; categoria_id?: number | null; subcategoria_id?: number | null;
  genero?: string | null; descripcion?: string | null; precio_compra?: number; precio_venta?: number; publicado_web?: boolean };

export default function CamposProducto({ p = {}, maestros }: { p?: P; maestros: Maestros }) {
  const [rubro, setRubro] = useState<number | "">(p.categoria_id ?? "");
  const subrubros = maestros.subcategorias.filter((s) => s.categoria_id === rubro);
  // Margen en vivo: cuánto se gana sobre el precio de compra (markup) y qué parte del precio es ganancia
  const [compra, setCompra] = useState(Number(p.precio_compra ?? 0));
  const [venta, setVenta] = useState(Number(p.precio_venta ?? 0));
  const markup = compra > 0 ? (venta / compra - 1) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[150px_1fr]">
        <div><label className="etiqueta">Código</label>
          <input name="codigo" defaultValue={p.codigo} placeholder="automático" className="campo font-mono uppercase" /></div>
        <div><label className="etiqueta">Modelo *</label>
          <input name="nombre" required defaultValue={p.nombre} placeholder="Zapatilla Running Pro" className="campo" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="etiqueta">Marca</label>
          <select name="marca_id" defaultValue={p.marca_id ?? ""} className="campo">
            <option value="">—</option>{maestros.marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre} ({m.codigo})</option>)}
          </select></div>
        <div><label className="etiqueta">Rubro *</label>
          <select name="categoria_id" required value={rubro} onChange={(e) => setRubro(e.target.value ? Number(e.target.value) : "")} className="campo">
            <option value="">Elegí…</option>{maestros.categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} ({c.codigo})</option>)}
          </select></div>
        <div><label className="etiqueta">Subrubro</label>
          {/* key: al cambiar de rubro se reinicia la elección del subrubro */}
          <select key={rubro} name="subcategoria_id" defaultValue={subrubros.some((s) => s.id === p.subcategoria_id) ? p.subcategoria_id ?? "" : ""} disabled={!subrubros.length} className="campo">
            <option value="">{rubro === "" ? "Elegí el rubro" : subrubros.length ? "—" : "Sin subrubros"}</option>
            {subrubros.map((s) => <option key={s.id} value={s.id}>{s.nombre} ({s.codigo})</option>)}
          </select></div>
      </div>
      <p className="-mt-2 text-xs text-texto-2">¿Falta una marca, rubro o subrubro? Agregalo en <Link href="/admin/tablas" className="font-semibold text-marca">Tablas</Link>.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="etiqueta">Género</label>
          <select name="genero" defaultValue={p.genero ?? ""} className="campo">
            <option value="">—</option>{["Hombre", "Mujer", "Unisex", "Niños"].map((g) => <option key={g}>{g}</option>)}
          </select></div>
        <div><label className="etiqueta">Precio de compra ($)</label><input name="precio_compra" type="number" min="0" step="0.01" defaultValue={p.precio_compra ?? ""} onChange={(e) => setCompra(Number(e.target.value))} className="campo" />
          <p className="mt-0.5 text-[11px] text-texto-2">El último que se pagó; cada compra lo actualiza.</p></div>
        <div><label className="etiqueta">Precio de venta ($)</label><input name="precio_venta" type="number" min="0" step="0.01" defaultValue={p.precio_venta ?? ""} onChange={(e) => setVenta(Number(e.target.value))} className="campo" />
          {markup !== null && venta > 0 && <p className={`mt-0.5 text-[11px] font-semibold ${venta < compra ? "text-error" : "text-ok"}`}>
            {venta < compra ? "¡Por debajo del costo!" : `Ganás ${Math.round(markup)} % sobre la compra (${Math.round((1 - compra / venta) * 100)} % del precio)`}</p>}</div>
      </div>
      <div><label className="etiqueta">Descripción (se ve en la tienda)</label><textarea name="descripcion" rows={2} defaultValue={p.descripcion ?? ""} className="campo" /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publicado_web" defaultChecked={p.publicado_web ?? false} /> Publicado en la tienda online</label>
    </div>
  );
}
