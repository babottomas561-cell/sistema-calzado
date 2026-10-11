"use client";
// Baja lo que se ve en un informe como archivo para Excel.
// Formato argentino: separador ";" y coma decimal, y una marca (BOM) al principio para que
// Excel respete los acentos. Las celdas con texto se envuelven en comillas.
import { Download } from "lucide-react";

type Celda = string | number | null;

function celda(v: Celda) {
  if (v === null) return "";
  if (typeof v === "number") return String(Math.round(v * 100) / 100).replace(".", ",");
  return `"${v.replace(/"/g, '""')}"`;
}

export default function BotonCSV({ archivo, columnas, filas }: { archivo: string; columnas: string[]; filas: Celda[][] }) {
  function bajar() {
    const texto = [columnas, ...filas].map((f) => f.map(celda).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `${archivo}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button type="button" onClick={bajar} className="boton-sec py-2" disabled={!filas.length}>
      <Download size={16} /> Excel
    </button>
  );
}
