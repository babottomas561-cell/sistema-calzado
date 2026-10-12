"use client";
// Barra de avisos de arriba: si hay varios (cuotas, envío, retiro…), rotan solos cada pocos segundos.
// Se frena al pasar el mouse; con "reducir movimiento" cambian sin animación.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function Avisos({ avisos, enlace }: { avisos: string[]; enlace: string | null }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  useEffect(() => {
    if (avisos.length < 2 || pausa) return;
    const t = setInterval(() => setI((x) => (x + 1) % avisos.length), 4500);
    return () => clearInterval(t);
  }, [avisos.length, pausa]);
  if (!avisos.length) return null;

  const texto = (
    <span key={i} className="entra inline-flex items-center gap-1.5" style={{ "--d": "0s" } as React.CSSProperties}>
      {avisos[i]}{enlace && <ArrowRight size={14} aria-hidden />}</span>
  );
  return (
    <div className="bg-marca px-4 py-2 text-center text-[0.82rem] font-semibold text-white" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}
      aria-live="off" aria-label={avisos.join(" · ")}>
      {enlace
        ? (/^https?:/.test(enlace) ? <a href={enlace} target="_blank" rel="noopener" className="hover:underline">{texto}</a> : <Link href={enlace} className="hover:underline">{texto}</Link>)
        : texto}
    </div>
  );
}
