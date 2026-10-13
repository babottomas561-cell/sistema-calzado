"use client";
// Impresión por persona del equipo: a cada uno se le puede poner otro papel, otro modo y otras copias. Lo que queda en «Como la tienda» usa la
// configuración de arriba. Ejemplo: el dueño en la compu de la caja con ticket automático; un vendedor desde el celular, manual (manda por WhatsApp).
import { useState, useTransition } from "react";
import { CircleCheck, UserRound } from "lucide-react";
import { FORMATOS, MODOS_IMPRESION, type FormatoComprobante, type ModoImpresion } from "@/lib/comprobante";
import { guardarImpresionPersona } from "./acciones";

export type Persona = { id: string; nombre: string; rol: string | null; formato: string | null; modo: string | null; copias: number | null };

function Fila({ p, tienda }: { p: Persona; tienda: { formato: FormatoComprobante; modo: ModoImpresion; copias: number } }) {
  const [v, setV] = useState({ formato: p.formato ?? "", modo: p.modo ?? "", copias: p.copias ? String(p.copias) : "" });
  const [estado, setEstado] = useState<{ ok?: string; error?: string }>({});
  const [guardando, hacer] = useTransition();
  const guardar = (nuevo: typeof v) => {
    setV(nuevo); setEstado({});
    hacer(async () => setEstado(await guardarImpresionPersona(p.id, { formato: nuevo.formato || null, modo: nuevo.modo || null, copias: Number(nuevo.copias) || null })));
  };
  const propio = !!(v.formato || v.modo || v.copias);
  const campo = "campo h-10 py-1.5 text-sm";
  return (
    <li className="grid gap-2 py-3 md:grid-cols-[minmax(0,12rem)_1fr_1fr_8rem] md:items-center">
      <div className="flex min-w-0 items-center gap-2">
        <UserRound size={17} strokeWidth={1.8} className="shrink-0 text-texto-2" />
        <div className="min-w-0"><p className="truncate font-medium">{p.nombre}</p>
          <p className="text-xs text-texto-2">{p.rol ?? "Equipo"}{propio ? " · tiene lo suyo" : ""}
            {guardando ? " · guardando…" : estado.ok ? <span className="text-ok"> · <CircleCheck size={11} className="inline align-[-1px]" /> guardado</span> : null}</p>
          {estado.error && <p role="alert" className="text-xs text-error">{estado.error}</p>}</div>
      </div>
      <select value={v.formato} onChange={(e) => guardar({ ...v, formato: e.target.value })} className={campo} aria-label={`Papel de ${p.nombre}`}>
        <option value="">Papel: como la tienda ({FORMATOS[tienda.formato].nombre})</option>
        {(Object.keys(FORMATOS) as FormatoComprobante[]).map((k) => <option key={k} value={k}>{FORMATOS[k].nombre}</option>)}
      </select>
      <select value={v.modo} onChange={(e) => guardar({ ...v, modo: e.target.value })} className={campo} aria-label={`Al vender, para ${p.nombre}`}>
        <option value="">Al vender: como la tienda ({MODOS_IMPRESION[tienda.modo].nombre.toLowerCase()})</option>
        {(Object.keys(MODOS_IMPRESION) as ModoImpresion[]).map((k) => <option key={k} value={k}>Al vender: {MODOS_IMPRESION[k].nombre.toLowerCase()}</option>)}
      </select>
      <select value={v.copias} onChange={(e) => guardar({ ...v, copias: e.target.value })} className={campo} aria-label={`Copias de ${p.nombre}`}>
        <option value="">Copias: {tienda.copias}</option>
        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "copia" : "copias"}</option>)}
      </select>
    </li>
  );
}

export default function ImpresionPorPersona({ personas, tienda }: { personas: Persona[]; tienda: { formato: FormatoComprobante; modo: ModoImpresion; copias: number } }) {
  return (
    <section className="space-y-3 print:hidden" aria-labelledby="por-persona">
      <div>
        <h2 id="por-persona" className="text-lg font-semibold">Por persona del equipo</h2>
        <p className="text-sm text-texto-2">Si alguien imprime distinto (otra impresora, o vende desde el celular y prefiere mandar el comprobante), ponele lo suyo. Lo que quede en «como la tienda» usa lo de arriba. Se guarda solo al elegir.</p>
      </div>
      <ul className="tarjeta divide-y divide-gray-100 py-1">
        {personas.map((p) => <Fila key={p.id} p={p} tienda={tienda} />)}
        {personas.length === 0 && <li className="py-3 text-sm text-texto-2">Todavía no hay personas en el equipo.</li>}
      </ul>
    </section>
  );
}
