"use client";
// Cambio o devolución desde la caja, sin salir: se escanea el código de barras del ticket (o se escribe el número de la factura, el cliente o el
// teléfono) y se abre esa venta para cambiar o devolver. Si la venta tenía factura, la nota de crédito la hace sola el sistema.
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, FileCheck2, Search, Undo2, X } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { buscarParaCambio, type VentaParaCambio } from "../acciones";

export default function CambioRapido({ inicial, alCerrar }: { inicial: string; alCerrar: () => void }) {
  const [q, setQ] = useState(inicial);
  const [resultados, setResultados] = useState<VentaParaCambio[] | null>(null);
  const [error, setError] = useState("");
  const [buscando, hacer] = useTransition();
  const campo = useRef<HTMLInputElement>(null);
  const buscar = (texto: string) => hacer(async () => {
    setError("");
    const r = await buscarParaCambio(texto);
    if (r.error) { setError(r.error); setResultados(null); } else setResultados(r.ventas ?? []);
  });
  // Si llegó con un número escaneado, se busca enseguida
  useEffect(() => { if (inicial) buscar(inicial); else campo.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") alCerrar(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [alCerrar]);
  const unica = resultados?.length === 1 ? resultados[0] : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-start sm:p-6 sm:pt-[10vh]" onClick={alCerrar}>
      <div role="dialog" aria-modal="true" aria-labelledby="cambio-titulo" onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="cambio-titulo" className="flex items-center gap-2 text-lg font-semibold"><ArrowLeftRight size={19} /> Cambio o devolución</h2>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={19} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); buscar(q); }} className="flex gap-2">
          <div className="relative flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input ref={campo} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escaneá el ticket, o escribí factura, cliente o teléfono"
              className="campo h-12 pl-9 text-base" aria-label="Buscar la venta" enterKeyHint="search" /></div>
          <button className="boton h-12" disabled={buscando || !q.trim()}>{buscando ? "Buscando…" : "Buscar"}</button>
        </form>
        <p className="mt-1.5 text-xs text-texto-2">El código de barras del ticket o de la factura que se llevó el cliente. Si la venta tenía factura, la nota de crédito sale sola.</p>
        {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
        {resultados && resultados.length === 0 && <p className="mt-3 text-sm text-texto-2">No encontramos ventas con «{q}».</p>}
        {resultados && resultados.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {resultados.map((r) => (
              <li key={r.id} className={`space-y-2 py-3 ${unica ? "" : "first:pt-1"}`}>
                <div className="text-sm">
                  <span className="font-mono font-semibold">{r.comprobante}</span> · {fechaHora(r.fecha)} · {r.cliente ?? "sin cliente"}
                  {r.factura && <span className="chip ml-1.5 gap-1 bg-green-50 text-ok"><FileCheck2 size={12} /> Factura {r.factura}</span>}
                  {!r.en_plazo && <span className="chip ml-1.5 bg-amber-100 text-alerta">fuera de plazo</span>}
                  <p className="text-texto-2">{r.productos}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/admin/ventas/${r.id}/cambio`} className="boton min-h-11"><ArrowLeftRight size={16} /> Cambio</Link>
                  <Link href={`/admin/ventas/${r.id}/devolucion`} className="boton-sec min-h-11"><Undo2 size={16} /> Devolución</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
