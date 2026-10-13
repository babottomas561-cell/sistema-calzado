"use client";
// La lista de pedidos por lo que hay que hacer. Arriba, cuatro grupos con su cantidad; abajo, cada pedido con cuánto espera, si pagó, cómo se entrega,
// su botón de avanzar (confirmar, preparar) y WhatsApp con el mensaje ya escrito. Entregar y cancelar se hacen adentro del pedido (hay que cobrar o dar motivo).
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, ChevronRight, CircleAlert, CreditCard, MapPin, MessageCircle, Search, Store, Truck } from "lucide-react";
import { ESTADOS } from "@/lib/estados-pedido";
import { paraWhatsApp } from "@/lib/telefono";
import { pesos } from "@/lib/formato";
import { avanzarPedido } from "./acciones";

export type FilaPedido = {
  id: number; comprobante: string; fecha: string; total: number; estado: string; canal: string; envio: boolean; direccion: string | null; pagado: boolean;
  cliente: string; telefono: string | null; medio: string;
};
type Grupo = "atender" | "preparar" | "entregar" | "cerrados";
const TITULO: Record<Grupo, { t: string; d: string }> = {
  atender: { t: "Para atender", d: "Nuevos y confirmados: hay que confirmarlos y armarlos." },
  preparar: { t: "Para entregar o enviar", d: "Ya están armados: falta que salgan o que los retiren." },
  entregar: { t: "En camino o para retirar", d: "Esperando que el cliente los reciba o los retire." },
  cerrados: { t: "Cerrados", d: "Entregados y cancelados (los últimos 150)." },
};
// Lo que se puede avanzar de un toque (entregar cobra y cancelar pide motivo: van adentro del pedido)
const AVANCE: Record<string, { a: string; texto: string } | undefined> = {
  pendiente: { a: "confirmado", texto: "Confirmar" }, confirmado: { a: "preparado", texto: "Marcar armado" },
};

const hace = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `hace ${m} min`; const h = Math.round(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24); return `hace ${d} ${d === 1 ? "día" : "días"}`;
};
const demora = (f: FilaPedido) => (f.estado === "pendiente" && Date.now() - new Date(f.fecha).getTime() > 2 * 3600e3) || (f.estado === "confirmado" && Date.now() - new Date(f.fecha).getTime() > 24 * 3600e3);

function mensaje(f: FilaPedido, tienda: string) {
  const n = f.cliente.split(" ")[0];
  const base = `Hola ${n}! Te escribimos de ${tienda} por tu pedido ${f.comprobante}. `;
  switch (f.estado) {
    case "pendiente": return base + "Ya lo recibimos y lo estamos revisando.";
    case "confirmado": return base + "Lo estamos armando, te avisamos cuando esté listo.";
    case "preparado": return base + (f.envio ? "Ya está armado, sale en el día." : "Ya está armado: podés pasar a retirarlo cuando quieras.");
    case "listo_retiro": return base + "Ya está listo para retirar en el local.";
    case "enviado": return base + "Ya salió. Cualquier duda, escribinos.";
    default: return base;
  }
}

export default function ListaPedidos({ filas, grupos, inicial, tienda }: { filas: FilaPedido[]; grupos: Record<Grupo, readonly string[]>; inicial: Grupo; tienda: string }) {
  const [grupo, setGrupo] = useState<Grupo>(inicial);
  const [q, setQ] = useState("");
  const [ocupado, hacer] = useTransition();
  const [aviso, setAviso] = useState<{ error?: string; ok?: string }>({});
  const cuenta = (g: Grupo) => filas.filter((f) => grupos[g].includes(f.estado)).length;
  const urgentes = filas.filter(demora).length;
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    const lista = filas.filter((f) => (t ? true : grupos[grupo].includes(f.estado)) && (!t || [f.comprobante, f.cliente, f.telefono, f.medio, f.canal].some((x) => (x ?? "").toLowerCase().includes(t))));
    return lista;
  }, [filas, grupo, q, grupos]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-2xl font-bold">Pedidos</h1>
        {urgentes > 0 && <p className="flex items-center gap-1.5 text-sm font-semibold text-alerta"><CircleAlert size={16} /> {urgentes} {urgentes === 1 ? "pedido espera" : "pedidos esperan"} demasiado</p>}</div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" role="tablist" aria-label="Qué hay que hacer">
        {(Object.keys(TITULO) as Grupo[]).map((g) => (
          <button key={g} type="button" role="tab" aria-selected={grupo === g && !q} onClick={() => { setGrupo(g); setQ(""); }}
            className={`rounded-xl border p-3 text-left transition ${grupo === g && !q ? "border-marca bg-marca-suave ring-1 ring-marca" : "border-borde bg-white hover:bg-gray-50"}`}>
            <span className="block text-xs font-semibold text-texto-2">{TITULO[g].t}</span>
            <span className={`block text-2xl font-bold tabular-nums ${cuenta(g) === 0 && g !== "cerrados" ? "text-gray-400" : ""}`}>{g === "cerrados" ? "…" : cuenta(g)}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-texto-2">{q ? `Resultados para «${q}» en todos los pedidos` : TITULO[grupo].d}</p>
      <div className="relative max-w-md"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por n.º, cliente o teléfono" className="campo pl-9" aria-label="Buscar pedido" /></div>
      {aviso.error && <p role="alert" className="text-sm text-error">{aviso.error}</p>}

      <ul className="divide-y divide-gray-100 rounded-xl border border-borde bg-white">
        {visibles.map((f) => {
          const wa = paraWhatsApp(f.telefono), av = AVANCE[f.estado];
          return (
            <li key={f.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <Link href={`/admin/pedidos/${f.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-semibold">{f.cliente}</span>
                    <span className="font-mono text-xs text-texto-2">{f.comprobante}</span>
                    <span className={`text-xs ${demora(f) ? "font-semibold text-alerta" : "text-texto-2"}`}>{hace(f.fecha)}</span></div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className={`chip ${ESTADOS[f.estado].color}`}>{ESTADOS[f.estado].texto}</span>
                    <span className="chip gap-1 bg-gray-100">{f.envio ? <><Truck size={12} /> Envío</> : <><Store size={12} /> Retira</>}</span>
                    {f.pagado ? <span className="chip gap-1 bg-green-50 text-ok"><CreditCard size={12} /> Pagado</span> : <span className="chip bg-gray-100 text-texto-2">{f.medio || "Sin pagar"}</span>}
                    {f.canal !== "Web" && <span className="chip bg-gray-100 text-texto-2">{f.canal}</span>}
                  </div>
                  {f.envio && f.direccion && <p className="mt-1 flex items-center gap-1 truncate text-xs text-texto-2"><MapPin size={12} className="shrink-0" /> {f.direccion}</p>}
                </div>
                <div className="shrink-0 text-right font-bold tabular-nums">{pesos(f.total)}</div>
                <ChevronRight size={16} className="shrink-0 text-gray-300" />
              </Link>
              {grupo !== "cerrados" || q ? (
                <div className="flex shrink-0 gap-1.5">
                  {wa && ["pendiente", "confirmado", "preparado", "enviado", "listo_retiro"].includes(f.estado) && (
                    <a href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje(f, tienda))}`} target="_blank" rel="noopener noreferrer" className="boton-sec min-h-9 px-3 text-sm" aria-label={`WhatsApp a ${f.cliente}`}><MessageCircle size={15} /> WhatsApp</a>)}
                  {av && <button type="button" disabled={ocupado} onClick={() => hacer(async () => setAviso(await avanzarPedido(f.id, av.a)))} className="boton min-h-9 px-3 text-sm"><Check size={15} /> {av.texto}</button>}
                  {!av && ["preparado", "enviado", "listo_retiro"].includes(f.estado) && <Link href={`/admin/pedidos/${f.id}`} className="boton min-h-9 px-3 text-sm">{f.estado === "preparado" ? "Despachar" : "Entregar"}</Link>}
                </div>
              ) : null}
            </li>
          );
        })}
        {visibles.length === 0 && <li className="px-4 py-10 text-center text-sm text-texto-2">{q ? `No hay pedidos con «${q}».` : "No hay pedidos acá. Cuando entre uno de la tienda, aparece en «Para atender»."}</li>}
      </ul>
    </div>
  );
}
