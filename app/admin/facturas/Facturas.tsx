"use client";
// Lo emitido en el período: totales (las notas de crédito restan), la lista y el libro IVA ventas en CSV (para el contador: una fila por comprobante
// autorizado, con el neto y el IVA de cada alícuota).
import Link from "next/link";
import { Download } from "lucide-react";
import { pesos } from "@/lib/formato";

export type FilaFactura = {
  id: number; clase: "factura" | "nota_credito"; letra: string; cbte_tipo: number; punto_venta: number; numero: number | null; comprobante: string | null; fecha: string;
  receptor: string; doc_tipo: number; doc_nro: string; neto: number; iva: number; detalle_iva: { alicuota: number; base: number; iva: number }[]; total: number;
  estado: string; cae: string | null; ultimo_error: string | null; venta_id: number; ambiente: string;
};

const ESTADO: Record<string, { texto: string; clase: string }> = {
  autorizada: { texto: "Autorizada", clase: "bg-green-50 text-ok" }, pendiente: { texto: "En la cola", clase: "bg-amber-50 text-alerta" },
  error: { texto: "Reintentando", clase: "bg-amber-50 text-alerta" }, rechazada: { texto: "Rechazada", clase: "bg-red-50 text-error" },
  cancelada: { texto: "Cancelada", clase: "bg-gray-100 text-gray-600" },
};
const DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 94: "Pasaporte", 99: "Sin identificar" };
const fechaCorta = (x: string) => new Date(`${x}T12:00:00`).toLocaleDateString("es-AR");
const signo = (f: FilaFactura) => (f.clase === "nota_credito" ? -1 : 1);
const num = (n: number) => n.toFixed(2).replace(".", ",");

export default function Facturas({ filas, desde, hasta }: { filas: FilaFactura[]; desde: string; hasta: string }) {
  const autorizadas = filas.filter((f) => f.estado === "autorizada");
  const suma = (k: "total" | "neto" | "iva") => autorizadas.reduce((s, f) => s + signo(f) * Number(f[k]), 0);
  const alicuotas = [...new Set(autorizadas.flatMap((f) => f.detalle_iva.map((d) => Number(d.alicuota))))].sort((a, b) => b - a);

  const descargar = () => {
    const cab = ["Fecha", "Tipo", "Letra", "Punto de venta", "Número", "Documento", "Número de documento", "Receptor",
      ...alicuotas.flatMap((a) => [`Neto ${num(a)} %`, `IVA ${num(a)} %`]), "Neto total", "IVA total", "Total", "CAE"];
    const filasCsv = [...autorizadas].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? 0) - (b.numero ?? 0)).map((f) => {
      const k = signo(f);
      const porAlic = alicuotas.flatMap((a) => { const d = f.detalle_iva.find((x) => Number(x.alicuota) === a); return [num(k * Number(d?.base ?? 0)), num(k * Number(d?.iva ?? 0))]; });
      return [fechaCorta(f.fecha), f.clase === "factura" ? "Factura" : "Nota de crédito", f.letra, f.punto_venta, f.numero ?? "", DOC[f.doc_tipo] ?? f.doc_tipo, f.doc_nro,
        `"${f.receptor.replace(/"/g, "'")}"`, ...porAlic, num(k * Number(f.neto)), num(k * Number(f.iva)), num(k * Number(f.total)), f.cae ?? ""].join(";");
    });
    const url = URL.createObjectURL(new Blob(["﻿" + [cab.join(";"), ...filasCsv].join("\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `libro-iva-ventas-${desde}-a-${hasta}.csv` }).click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Facturado (con IVA)", suma("total")], ["Neto gravado", suma("neto")], ["IVA", suma("iva")]].map(([t, v]) => (
          <div key={t as string} className="tarjeta"><p className="text-xs font-semibold text-texto-2">{t}</p><p className="text-xl font-bold tabular-nums">{pesos(v as number)}</p></div>
        ))}
        <button type="button" onClick={descargar} disabled={!autorizadas.length} className="boton-sec min-h-12 justify-center"><Download size={16} /> Libro IVA ventas (CSV)</button>
      </div>
      <p className="text-xs text-texto-2">Solo lo autorizado por ARCA; las notas de crédito restan.</p>
      {filas.length === 0 ? <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">No hay comprobantes en estas fechas.</p> : (
        <div className="overflow-x-auto rounded-xl border border-borde bg-white">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Comprobante</th><th>Receptor</th><th className="text-right">Neto</th><th className="text-right">IVA</th><th className="text-right">Total</th><th>Estado</th></tr></thead>
            <tbody>{filas.map((f) => (
              <tr key={f.id}>
                <td className="whitespace-nowrap">{fechaCorta(f.fecha)}</td>
                <td className="whitespace-nowrap"><Link href={`/admin/ventas/${f.venta_id}`} className="font-semibold text-marca">{f.clase === "factura" ? "Factura" : "NC"} {f.letra} <span className="font-mono">{f.comprobante ?? "—"}</span></Link>
                  {f.ambiente === "homologacion" && <span className="ml-1 rounded bg-gray-100 px-1 text-[10px] font-bold uppercase text-gray-600">prueba</span>}</td>
                <td className="max-w-56 truncate">{f.receptor}{f.doc_tipo !== 99 && <span className="block text-xs text-texto-2">{DOC[f.doc_tipo]} {f.doc_nro}</span>}</td>
                <td className="text-right tabular-nums">{pesos(signo(f) * Number(f.neto))}</td><td className="text-right tabular-nums">{pesos(signo(f) * Number(f.iva))}</td>
                <td className="text-right font-semibold tabular-nums">{pesos(signo(f) * Number(f.total))}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[f.estado]?.clase ?? ""}`}>{ESTADO[f.estado]?.texto ?? f.estado}</span>
                  {f.ultimo_error && f.estado !== "autorizada" && <span className="block max-w-56 truncate text-xs text-texto-2" title={f.ultimo_error}>{f.ultimo_error}</span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
