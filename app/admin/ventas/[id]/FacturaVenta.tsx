"use client";
// La factura de ARCA de una venta y su nota de crédito: estado, número y CAE. «Facturar» si se vendió con comprobante interno y «Reintentar» si
// quedó rechazada (después de corregir el dato) o en la cola. La base decide letra, importes y número; acá solo se pide.
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Clock, FileCheck2, RotateCw } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { facturarVenta, reintentarFactura } from "../acciones";

export type Factura = {
  id: number; clase: "factura" | "nota_credito"; letra: string; comprobante: string | null; estado: "pendiente" | "autorizada" | "rechazada" | "error" | "cancelada";
  cae: string | null; cae_vence: string | null; total: number; ultimo_error: string | null; proximo_intento: string | null; ambiente: string;
};

const ESTADO: Record<Factura["estado"], { texto: string; clase: string }> = {
  autorizada: { texto: "Autorizada", clase: "bg-green-50 text-ok" },
  pendiente: { texto: "En la cola", clase: "bg-amber-50 text-alerta" },
  error: { texto: "En la cola", clase: "bg-amber-50 text-alerta" },
  rechazada: { texto: "Rechazada", clase: "bg-red-50 text-error" },
  cancelada: { texto: "Cancelada", clase: "bg-gray-100 text-gray-600" },
};

export default function FacturaVenta({ venta, facturas, puedeFacturar, letra, anulada }: {
  venta: number; facturas: Factura[]; puedeFacturar: boolean; letra: string | null; anulada: boolean;
}) {
  const [resultado, setResultado] = useState<{ error?: string; ok?: string }>({});
  const [ocupado, hacer] = useTransition();
  const vigente = facturas.find((f) => f.clase === "factura" && f.estado !== "cancelada");
  if (!facturas.length && !(puedeFacturar && letra && !anulada)) return null;
  return (
    <section className="tarjeta space-y-3" aria-labelledby="factura-titulo">
      <h2 id="factura-titulo" className="flex items-center gap-2 font-semibold"><FileCheck2 size={17} /> Factura de ARCA</h2>
      {facturas.length > 0 && (
        <ul className="divide-y divide-gray-100 text-sm">
          {facturas.map((f) => (
            <li key={f.id} className="space-y-1 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{f.clase === "factura" ? "Factura" : "Nota de crédito"} {f.letra} <span className="font-mono">{f.comprobante ?? "(sin número todavía)"}</span>
                  {f.ambiente === "homologacion" && <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-semibold text-gray-600">pruebas</span>}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ESTADO[f.estado].clase}`}>{ESTADO[f.estado].texto}</span>
              </div>
              <p className="text-texto-2">{pesos(f.total)}{f.cae ? <> · CAE <span className="font-mono">{f.cae}</span> (vence {new Date(`${f.cae_vence}T12:00:00`).toLocaleDateString("es-AR")})</> : null}</p>
              {f.estado === "rechazada" && f.ultimo_error && <p className="flex items-start gap-1.5 text-error"><CircleAlert size={15} className="mt-0.5 shrink-0" /> {f.ultimo_error}</p>}
              {(f.estado === "pendiente" || f.estado === "error") && (
                <p className="flex items-start gap-1.5 text-alerta"><Clock size={15} className="mt-0.5 shrink-0" />
                  {f.clase === "nota_credito" && f.ultimo_error?.startsWith("Espera") ? f.ultimo_error : <>Se manda sola{f.proximo_intento ? ` (próximo intento ${fechaHora(f.proximo_intento)})` : ""}.{f.ultimo_error ? ` Último error: ${f.ultimo_error}` : ""}</>}</p>
              )}
              {puedeFacturar && ["rechazada", "error", "pendiente"].includes(f.estado) && (
                <button type="button" disabled={ocupado} onClick={() => hacer(async () => setResultado(await reintentarFactura(f.id, venta)))} className="boton-sec min-h-9 text-sm">
                  <RotateCw size={15} strokeWidth={1.8} /> {ocupado ? "Mandando a ARCA…" : "Reintentar ahora"}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!vigente && puedeFacturar && letra && !anulada && (
        <div className="space-y-2">
          <p className="text-sm text-texto-2">Esta venta salió con comprobante interno. Si el cliente pide factura, se hace ahora, con la fecha de hoy.</p>
          <button type="button" disabled={ocupado} onClick={() => hacer(async () => setResultado(await facturarVenta(venta)))} className="boton min-h-10">
            <FileCheck2 size={16} /> {ocupado ? "Mandando a ARCA…" : `Hacer Factura ${letra}`}</button>
        </div>
      )}
      {resultado.ok && <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {resultado.ok}</p>}
      {resultado.error && <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {resultado.error}</p>}
    </section>
  );
}
