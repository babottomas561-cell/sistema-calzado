"use client";
// El libro IVA ventas del período en CSV (para el contador): una fila por comprobante autorizado, con el neto y el IVA de cada alícuota. Las notas de
// crédito restan. Arriba, lo facturado, el neto y el IVA del período.
import { Download } from "lucide-react";
import { pesos } from "@/lib/formato";

export type FilaIva = {
  clase: "factura" | "nota_credito"; letra: string; punto_venta: number; numero: number | null; fecha: string; doc_tipo: number; doc_nro: string; receptor: string;
  neto: number; iva: number; detalle_iva: { alicuota: number; base: number; iva: number }[]; total: number; cae: string | null;
};
const DOC: Record<number, string> = { 80: "CUIT", 86: "CUIL", 96: "DNI", 94: "Pasaporte", 99: "Sin identificar" };
const num = (n: number) => n.toFixed(2).replace(".", ",");
const signo = (f: FilaIva) => (f.clase === "nota_credito" ? -1 : 1);

export default function LibroIva({ filas, desde, hasta }: { filas: FilaIva[]; desde: string; hasta: string }) {
  const suma = (k: "total" | "neto" | "iva") => filas.reduce((s, f) => s + signo(f) * Number(f[k]), 0);
  const descargar = () => {
    const alicuotas = [...new Set(filas.flatMap((f) => f.detalle_iva.map((d) => Number(d.alicuota))))].sort((a, b) => b - a);
    const cab = ["Fecha", "Tipo", "Letra", "Punto de venta", "Número", "Documento", "Número de documento", "Receptor",
      ...alicuotas.flatMap((a) => [`Neto ${num(a)} %`, `IVA ${num(a)} %`]), "Neto total", "IVA total", "Total", "CAE"];
    const lineas = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha) || (a.numero ?? 0) - (b.numero ?? 0)).map((f) => {
      const k = signo(f);
      const porAlic = alicuotas.flatMap((a) => { const d = f.detalle_iva.find((x) => Number(x.alicuota) === a); return [num(k * Number(d?.base ?? 0)), num(k * Number(d?.iva ?? 0))]; });
      return [new Date(`${f.fecha}T12:00:00`).toLocaleDateString("es-AR"), f.clase === "factura" ? "Factura" : "Nota de crédito", f.letra, f.punto_venta, f.numero ?? "",
        DOC[f.doc_tipo] ?? f.doc_tipo, f.doc_nro, `"${f.receptor.replace(/"/g, "'")}"`, ...porAlic, num(k * Number(f.neto)), num(k * Number(f.iva)), num(k * Number(f.total)), f.cae ?? ""].join(";");
    });
    const url = URL.createObjectURL(new Blob(["﻿" + [cab.join(";"), ...lineas].join("\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `libro-iva-ventas-${desde}-a-${hasta}.csv` }).click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-borde bg-white px-4 py-3 text-sm">
      <span className="font-semibold">Facturado con ARCA</span>
      <span>Total <b className="tabular-nums">{pesos(suma("total"))}</b></span>
      <span>Neto <b className="tabular-nums">{pesos(suma("neto"))}</b></span>
      <span>IVA <b className="tabular-nums">{pesos(suma("iva"))}</b></span>
      <span className="text-xs text-texto-2">{filas.length} comprobantes (las notas de crédito restan)</span>
      <button type="button" onClick={descargar} className="boton-sec ml-auto min-h-10"><Download size={16} /> Libro IVA ventas</button>
    </div>
  );
}
