"use client";
// Ventas que salieron sin factura: se eligen (una por una o todas) y se facturan en tanda, con la fecha de hoy. Las facturas quedan en la cola y
// salen a ARCA en los próximos minutos; lo que no se pudo (por ejemplo, falta el DNI desde el umbral) se dice con su motivo.
import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, FileCheck2 } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { facturarEnTanda } from "./acciones";

export type VentaSinFactura = { id: number; comprobante: string; fecha: string; total: number; cliente: string | null; medios: string | null };

export default function SinFactura({ ventas, puedeFacturar }: { ventas: VentaSinFactura[]; puedeFacturar: boolean }) {
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<{ error?: string; ok?: string; errores?: { venta: string; error: string }[] }>({});
  const [ocupado, hacer] = useTransition();
  const todas = ventas.length > 0 && elegidas.size === ventas.length;
  const alternar = (id: number) => setElegidas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const total = ventas.filter((v) => elegidas.has(v.id)).reduce((s, v) => s + Number(v.total), 0);

  if (!ventas.length) return <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">Todas las ventas de estas fechas tienen factura.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-2">{ventas.length} {ventas.length === 1 ? "venta salió" : "ventas salieron"} sin factura. Si hay que regularizarlas, elegilas y facturalas: cada una sale con su factura y la <b>fecha de hoy</b> (ARCA no acepta fechas viejas). Dejarlas como están también vale; lo decide el contador.</p>
      {puedeFacturar && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todas} onChange={() => setElegidas(todas ? new Set() : new Set(ventas.map((v) => v.id).slice(0, 200)))} className="h-4 w-4 accent-[var(--color-marca)]" /> Todas</label>
          <span className="text-sm text-texto-2">{elegidas.size} elegidas · {pesos(total)}</span>
          <button type="button" disabled={ocupado || !elegidas.size} onClick={() => hacer(async () => { const r = await facturarEnTanda([...elegidas]); setResultado(r); if (r.ok) setElegidas(new Set()); })}
            className="boton ml-auto min-h-10"><FileCheck2 size={16} /> {ocupado ? "Creando facturas…" : "Facturar las elegidas"}</button>
        </div>
      )}
      {resultado.ok && <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {resultado.ok}</p>}
      {resultado.error && <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {resultado.error}</p>}
      {!!resultado.errores?.length && <ul className="space-y-1 rounded-lg bg-red-50 p-3 text-sm text-error">{resultado.errores.map((e, i) => <li key={i}><b className="font-mono">{e.venta}</b>: {e.error}</li>)}</ul>}
      <ul className="divide-y divide-gray-100 rounded-xl border border-borde bg-white">
        {ventas.map((v) => (
          <li key={v.id}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-gray-50">
              {puedeFacturar && <input type="checkbox" checked={elegidas.has(v.id)} onChange={() => alternar(v.id)} className="h-4 w-4 shrink-0 accent-[var(--color-marca)]" />}
              <span className="min-w-0 flex-1"><Link href={`/admin/ventas/${v.id}`} className="font-mono font-semibold text-marca">{v.comprobante}</Link>
                <span className="text-texto-2"> · {fechaHora(v.fecha)} · {v.cliente ?? "sin cliente"}{v.medios ? ` · ${v.medios}` : ""}</span></span>
              <span className="shrink-0 font-semibold tabular-nums">{pesos(v.total)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
