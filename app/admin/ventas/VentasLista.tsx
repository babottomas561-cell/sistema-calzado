"use client";
// La lista de ventas: buscador (ticket, factura, cliente o vendedor), una tarjeta por venta en el celular y una tabla en la compu, con su factura.
// Con el filtro «Sin factura» se pueden elegir y facturar en tanda (cada una con la fecha de hoy; las manda la cola a ARCA).
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, CircleAlert, CircleCheck, FileCheck2, Search } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { facturarEnTanda } from "./acciones";

export type FilaVenta = {
  id: number; comprobante: string; fecha: string; total: number; canal: string; pedido: boolean; anulada: boolean; cliente: string | null; vendedor: string | null;
  unidades: number; medios: string; factura: { letra: string; comprobante: string | null; estado: string } | null;
};

function Factura({ f, arca }: { f: FilaVenta["factura"]; arca: boolean }) {
  if (!f) return arca ? <span className="chip bg-gray-100 text-texto-2">Sin factura</span> : null;
  if (f.estado === "autorizada") return <span className="chip gap-1 bg-green-50 text-ok"><FileCheck2 size={12} /> {f.letra} {f.comprobante}</span>;
  if (f.estado === "rechazada") return <span className="chip bg-red-50 text-error">Factura rechazada</span>;
  return <span className="chip bg-amber-50 text-alerta">Factura en trámite</span>;
}

export default function VentasLista({ filas, seleccionar, arca }: { filas: FilaVenta[]; seleccionar: boolean; arca: boolean }) {
  const [q, setQ] = useState("");
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<{ error?: string; ok?: string; errores?: { venta: string; error: string }[] }>({});
  const [ocupado, hacer] = useTransition();
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return filas;
    return filas.filter((v) => [v.comprobante, v.cliente, v.vendedor, v.factura?.comprobante, v.medios].some((x) => (x ?? "").toLowerCase().includes(t)));
  }, [filas, q]);
  const alternar = (id: number) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = visibles.length > 0 && visibles.every((v) => elegidas.has(v.id));
  const montoElegido = filas.filter((v) => elegidas.has(v.id)).reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-3">
      <div className="relative max-w-md"><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por ticket, factura, cliente o vendedor" className="campo pl-9" aria-label="Buscar venta" /></div>

      {seleccionar && visibles.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todas} onChange={() => setElegidas(todas ? new Set() : new Set(visibles.slice(0, 200).map((v) => v.id)))} className="h-4 w-4 accent-[var(--color-marca)]" /> Todas</label>
          <span className="text-sm text-texto-2">{elegidas.size} elegidas · {pesos(montoElegido)} · salen con la fecha de hoy</span>
          <button type="button" disabled={ocupado || !elegidas.size} onClick={() => hacer(async () => { const r = await facturarEnTanda([...elegidas]); setResultado(r); if (r.ok) setElegidas(new Set()); })}
            className="boton ml-auto min-h-10"><FileCheck2 size={16} /> {ocupado ? "Creando facturas…" : "Facturar las elegidas"}</button>
        </div>
      )}
      {resultado.ok && <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {resultado.ok}</p>}
      {resultado.error && <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {resultado.error}</p>}
      {!!resultado.errores?.length && <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-error">{resultado.errores.map((e, i) => <li key={i}><b className="font-mono">{e.venta}</b>: {e.error}</li>)}</ul>}

      {/* Celular */}
      <div className="tarjeta divide-y divide-gray-100 p-0 md:hidden">
        {visibles.map((v) => (
          <div key={v.id} className={`flex items-center gap-3 px-4 py-3 ${v.anulada ? "opacity-60" : ""}`}>
            {seleccionar && <input type="checkbox" checked={elegidas.has(v.id)} onChange={() => alternar(v.id)} aria-label={`Elegir ${v.comprobante}`} className="h-5 w-5 shrink-0 accent-[var(--color-marca)]" />}
            <Link href={`/admin/ventas/${v.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{v.cliente ?? "Sin cliente"}</div>
                <div className="truncate text-xs text-texto-2">{fechaHora(v.fecha)} · <span className="font-mono">{v.comprobante}</span>{v.vendedor ? ` · ${v.vendedor}` : ""}</div>
                <div className="mt-1 flex flex-wrap gap-1">{v.anulada && <span className="chip bg-red-50 text-error">Anulada</span>}<Factura f={v.factura} arca={arca} />
                  {v.medios && <span className="chip bg-gray-100 text-texto-2">{v.medios}</span>}{v.pedido && <span className="chip bg-blue-50 text-marca">pedido</span>}</div>
              </div>
              <div className="shrink-0 text-right text-sm"><div className={`font-bold ${v.anulada ? "line-through" : ""}`}>{pesos(v.total)}</div><div className="text-xs text-texto-2">{v.unidades} u.</div></div>
              <ChevronRight size={16} className="shrink-0 text-gray-300" />
            </Link>
          </div>
        ))}
        {visibles.length === 0 && <p className="py-8 text-center text-sm text-texto-2">No hay ventas{q ? ` con «${q}»` : " en este período"}.</p>}
      </div>

      {/* Compu */}
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr>{seleccionar && <th className="w-8" />}<th>Ticket</th><th>Fecha</th><th>Cliente</th><th>Vendió</th>{arca && <th>Factura</th>}<th>Pago</th><th className="text-right">Unid.</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {visibles.map((v) => (
              <tr key={v.id} className={v.anulada ? "text-texto-2" : ""}>
                {seleccionar && <td><input type="checkbox" checked={elegidas.has(v.id)} onChange={() => alternar(v.id)} aria-label={`Elegir ${v.comprobante}`} className="h-4 w-4 accent-[var(--color-marca)]" /></td>}
                <td className="whitespace-nowrap"><Link href={`/admin/ventas/${v.id}`} className="font-mono font-semibold text-marca">{v.comprobante}</Link>
                  {v.anulada && <span className="chip ml-1.5 bg-red-50 text-error">Anulada</span>}{v.pedido && <span className="chip ml-1 bg-blue-50 text-marca">pedido</span>}</td>
                <td className="whitespace-nowrap">{fechaHora(v.fecha)}</td>
                <td>{v.cliente ?? "—"}</td>
                <td className="text-texto-2">{v.vendedor ?? "—"}</td>
                {arca && <td className="whitespace-nowrap"><Factura f={v.factura} arca={arca} /></td>}
                <td className="text-texto-2">{v.medios || "—"}</td>
                <td className="text-right">{v.unidades}</td>
                <td className={`text-right font-semibold tabular-nums ${v.anulada ? "line-through" : ""}`}>{pesos(v.total)}</td>
              </tr>
            ))}
            {visibles.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-texto-2">No hay ventas{q ? ` con «${q}»` : " en este período"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
