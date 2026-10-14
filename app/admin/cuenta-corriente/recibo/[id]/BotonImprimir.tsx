"use client";
import { Printer } from "lucide-react";

export default function BotonImprimir() {
  return <button type="button" onClick={() => window.print()} className="boton-sec"><Printer size={16} strokeWidth={1.8} /> Imprimir</button>;
}
