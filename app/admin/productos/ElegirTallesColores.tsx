"use client";
// Elegir talles y colores TILDANDO de las tablas (sin escribir): se crea una variante por cada combinación.
import Link from "next/link";
import { useState } from "react";

export type Talle = { id: number; nombre: string; tipo: string };
export type Color = { id: number; nombre: string; codigo: string; hex: string | null };

export default function ElegirTallesColores({ talles, colores }: { talles: Talle[]; colores: Color[] }) {
  const [tTilde, setT] = useState<number[]>([]);
  const [cTilde, setC] = useState<number[]>([]);
  // Actualización funcional: dos toques seguidos no se pisan
  const alternar = (set: React.Dispatch<React.SetStateAction<number[]>>, id: number) =>
    set((lista) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]));
  const tipos = [...new Set(talles.map((t) => t.tipo))];

  return (
    <div className="space-y-3">
      {tipos.map((tipo) => (
        <div key={tipo}>
          <div className="mb-1 flex items-center gap-3"><span className="etiqueta mb-0">Talles {tipo.toLowerCase()}</span>
            <button type="button" className="text-xs font-semibold text-marca" onClick={() => setT((l) => [...new Set([...l, ...talles.filter((t) => t.tipo === tipo).map((t) => t.id)])])}>todos</button></div>
          <div className="flex flex-wrap gap-1.5">{talles.filter((t) => t.tipo === tipo).map((t) => (
            <button key={t.id} type="button" onClick={() => alternar(setT, t.id)}
              className={`min-w-11 rounded-md border px-2 py-1 text-sm ${tTilde.includes(t.id) ? "border-marca bg-marca text-white" : "border-borde bg-white"}`}>{t.nombre}</button>
          ))}</div>
        </div>
      ))}
      <div><div className="etiqueta">Colores</div>
        <div className="flex flex-wrap gap-1.5">{colores.map((c) => (
          <button key={c.id} type="button" onClick={() => alternar(setC, c.id)}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm ${cTilde.includes(c.id) ? "border-marca bg-marca-suave font-semibold" : "border-borde bg-white"}`}>
            <span className="h-3 w-3 rounded-full border border-gray-300" style={{ background: c.hex ?? "#ddd" }} />{c.nombre}</button>
        ))}</div></div>
      <p className="text-xs text-texto-2">{tTilde.length * cTilde.length} {tTilde.length * cTilde.length === 1 ? "combinación" : "combinaciones"} · ¿Falta un talle o color? Agregalo en <Link href="/admin/tablas" className="font-semibold text-marca">Tablas</Link>.</p>
      {tTilde.map((id) => <input key={`t${id}`} type="hidden" name="talle_ids" value={id} />)}
      {cTilde.map((id) => <input key={`c${id}`} type="hidden" name="color_ids" value={id} />)}
    </div>
  );
}
