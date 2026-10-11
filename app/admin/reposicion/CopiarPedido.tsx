"use client";
// Copia el pedido sugerido como texto listo para pegar en WhatsApp (o lo comparte directo).
import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

export default function CopiarPedido({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
    catch { window.prompt("Copiá el pedido:", texto); }   // sin permiso de portapapeles
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={copiar} className="boton-sec py-2">{copiado ? <Check size={16} className="text-ok" /> : <Copy size={16} />} {copiado ? "Copiado" : "Copiar pedido"}</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener" className="boton-sec py-2"><MessageCircle size={16} /> WhatsApp</a>
    </div>
  );
}
