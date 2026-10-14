"use client";
// Armar y editar las curvas de compra: nombre, escala de talles, proveedor (opcional) y cuántas unidades de cada talle.
import { useState, useTransition } from "react";
import { CircleCheck, Pencil, Plus, Ruler, Trash2, X } from "lucide-react";
import { guardarCurva, quitarCurva } from "../acciones";

export type Curva = { id: number; nombre: string; escala: string; proveedor_id: number | null; items: { talle_id: number; cantidad: number }[] };
type Talle = { id: number; nombre: string; tipo: string; orden: number };

export default function Curvas({ curvas, talles, proveedores }: { curvas: Curva[]; talles: Talle[]; proveedores: { id: number; nombre: string }[] }) {
  // «Adulto» primero (la más usada en calzado); después las demás
  const escalas = [...new Set(talles.map((t) => t.tipo))].sort((a, b) => Number(b === "Adulto") - Number(a === "Adulto"));
  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [nombre, setNombre] = useState("");
  const [escala, setEscala] = useState(escalas[0] ?? "");
  const [proveedor, setProveedor] = useState<number | "">("");
  const [cant, setCant] = useState<Record<number, number>>({});
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const [ocupado, empezar] = useTransition();
  const tallesDe = (e: string) => talles.filter((t) => t.tipo === e).sort((a, b) => a.orden - b.orden);
  const nombreTalle = (id: number) => talles.find((t) => t.id === id)?.nombre ?? "?";

  const abrir = (c?: Curva) => {
    setEditando(c ? c.id : "nueva"); setNombre(c?.nombre ?? ""); setEscala(c?.escala ?? escalas[0] ?? ""); setProveedor(c?.proveedor_id ?? "");
    setCant(Object.fromEntries((c?.items ?? []).map((i) => [i.talle_id, i.cantidad]))); setAviso({});
  };
  const guardar = () => empezar(async () => {
    const items = tallesDe(escala).filter((t) => (cant[t.id] ?? 0) > 0).map((t) => ({ talle_id: t.id, cantidad: cant[t.id] }));
    const r = await guardarCurva(nombre, escala, items, proveedor || null, editando === "nueva" ? null : editando);
    setAviso(r); if (r.ok) setEditando(null);
  });
  const total = tallesDe(escala).reduce((s, t) => s + (cant[t.id] ?? 0), 0);

  return (
    <div className={`space-y-4 ${ocupado ? "opacity-70" : ""}`}>
      {curvas.map((c) => (
        <section key={c.id} className="tarjeta space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="flex items-center gap-2 font-semibold"><Ruler size={16} strokeWidth={1.8} className="text-marca" /> {c.nombre}</h2>
              <p className="text-xs text-texto-2">{c.escala} · {c.items.reduce((t, i) => t + i.cantidad, 0)} unidades por curva{c.proveedor_id ? ` · ${proveedores.find((p) => p.id === c.proveedor_id)?.nombre ?? ""}` : ""}</p></div>
            <div className="flex gap-1">
              <button type="button" aria-label={`Editar ${c.nombre}`} className="grid h-8 w-8 place-items-center rounded-lg text-texto-2 hover:bg-gray-100" onClick={() => abrir(c)}><Pencil size={16} strokeWidth={1.8} /></button>
              <button type="button" aria-label={`Quitar ${c.nombre}`} disabled={ocupado} className="grid h-8 w-8 place-items-center rounded-lg text-texto-2 hover:bg-red-50 hover:text-error"
                onClick={() => confirm(`¿Quitar la curva «${c.nombre}»?`) && empezar(async () => setAviso(await quitarCurva(c.id)))}><Trash2 size={16} strokeWidth={1.8} /></button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">{[...c.items].sort((a, b) => (talles.find((t) => t.id === a.talle_id)?.orden ?? 0) - (talles.find((t) => t.id === b.talle_id)?.orden ?? 0))
            .map((i) => <span key={i.talle_id} className="chip bg-gray-100"><b>{nombreTalle(i.talle_id)}</b>: {i.cantidad}</span>)}</div>
        </section>
      ))}
      {curvas.length === 0 && editando === null && <div className="rounded-xl border border-dashed border-borde p-8 text-center text-sm text-texto-2">Todavía no hay curvas. Armá la primera con el botón de abajo.</div>}

      {editando !== null ? (
        <section className="tarjeta space-y-3 border-marca/40">
          <div className="flex items-center justify-between"><h2 className="font-semibold">{editando === "nueva" ? "Curva nueva" : "Editar curva"}</h2>
            <button type="button" aria-label="Cerrar" className="text-gray-400 hover:text-gray-700" onClick={() => setEditando(null)}><X size={18} /></button></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1"><label className="etiqueta" htmlFor="c-nombre">Nombre</label><input id="c-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Calzado 39 al 42" maxLength={60} className="campo" /></div>
            <div><label className="etiqueta" htmlFor="c-escala">Escala de talles</label>
              <select id="c-escala" value={escala} onChange={(e) => { setEscala(e.target.value); setCant({}); }} className="campo">{escalas.map((e) => <option key={e}>{e}</option>)}</select></div>
            <div><label className="etiqueta" htmlFor="c-prov">Proveedor (opcional)</label>
              <select id="c-prov" value={proveedor} onChange={(e) => setProveedor(e.target.value ? Number(e.target.value) : "")} className="campo"><option value="">Cualquiera</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          </div>
          <div><p className="etiqueta">Unidades de cada talle en una curva</p>
            <div className="flex flex-wrap gap-2">{tallesDe(escala).map((t) => (
              <label key={t.id} className="flex w-16 flex-col items-center gap-1 text-xs font-semibold">{t.nombre}
                <input type="number" min={0} inputMode="numeric" value={cant[t.id] || ""} placeholder="0" aria-label={`Talle ${t.nombre}`} onChange={(e) => setCant({ ...cant, [t.id]: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
                  className={`w-16 rounded-md border px-1 py-1.5 text-center text-sm ${cant[t.id] ? "border-marca bg-marca-suave" : "border-borde"}`} /></label>
            ))}</div></div>
          <p className="text-sm text-texto-2">{total} unidades por curva.</p>
          {aviso.error && <p role="alert" className="text-sm text-error">{aviso.error}</p>}
          <button type="button" className="boton" disabled={ocupado || !nombre.trim() || total === 0} onClick={guardar}>{ocupado ? "Guardando…" : "Guardar curva"}</button>
        </section>
      ) : (
        <button type="button" className="boton-sec" onClick={() => abrir()}><Plus size={15} /> Nueva curva</button>
      )}
      {aviso.ok && editando === null && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {aviso.ok}</p>}
    </div>
  );
}
