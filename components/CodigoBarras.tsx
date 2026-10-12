"use client";
// El código de barras dibujado en SVG: es vectorial, así se imprime nítido en cualquier etiqueta o ticket, y se estira
// al ancho disponible (las barras conservan su proporción). Sin el número abajo: ese lo pone quien lo usa si lo quiere.
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { FORMATO_JSBARCODE, tipoDeCodigo, type TipoCodigo } from "@/lib/codigos";

export default function CodigoBarras({ codigo, tipo, alto = "10mm", className = "" }: { codigo: string; tipo?: TipoCodigo; alto?: string; className?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return;
    try {
      JsBarcode(svg, codigo, { format: FORMATO_JSBARCODE[tipo ?? tipoDeCodigo(codigo)], displayValue: false, margin: 0, height: 60, width: 2, background: "transparent", lineColor: "#000" });
      // Que escale al espacio: con viewBox y sin ancho ni alto fijos
      const w = parseFloat(svg.getAttribute("width") ?? "0"), h = parseFloat(svg.getAttribute("height") ?? "0");
      if (w && h && !svg.getAttribute("viewBox")) svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.setAttribute("preserveAspectRatio", "none");
    } catch { svg.innerHTML = ""; }   // un código que el formato no admite: queda vacío (el llamador muestra el número)
  }, [codigo, tipo]);
  return <svg ref={ref} role="img" aria-label={`Código de barras ${codigo}`} className={className} style={{ width: "100%", height: alto, display: "block" }} />;
}
