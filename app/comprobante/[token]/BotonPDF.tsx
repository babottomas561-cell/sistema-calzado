"use client";
// Guardar el comprobante como PDF: se abre la ventana de impresión del celular o la compu, y ahí se elige «Guardar como PDF».
import { Download } from "lucide-react";

export default function BotonPDF() {
  return <button type="button" onClick={() => window.print()} className="boton min-h-12 w-full"><Download size={18} strokeWidth={1.8} /> Guardar como PDF</button>;
}
