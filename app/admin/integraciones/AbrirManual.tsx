"use client";
// Atajo al manual de la integración: baja hasta él y lo abre (está plegado para no tapar la configuración)
import { BookOpen } from "lucide-react";

export default function AbrirManual() {
  return (
    <a href="#manual" onClick={() => { const d = document.getElementById("manual") as HTMLDetailsElement | null; if (d) d.open = true; }}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca"><BookOpen size={15} strokeWidth={1.8} /> Ver el manual paso a paso</a>
  );
}
