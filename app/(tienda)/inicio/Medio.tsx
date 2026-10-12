"use client";
// La foto o el video de fondo de una campaña. El video va mudo, en loop y sin controles (como en las
// marcas de moda); si el sistema pide "reducir movimiento", queda quieto en el primer cuadro.
import { useEffect, useRef } from "react";
import { esVideo } from "@/lib/inicio";

export default function Medio({ url, className, prioridad = false }: { url: string; className: string; prioridad?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) v.pause();
    else v.play().catch(() => {});   // algunos celulares en ahorro de batería no lo dejan: queda el primer cuadro
  }, []);
  if (esVideo(url)) return <video ref={video} src={url} muted loop playsInline autoPlay preload={prioridad ? "auto" : "metadata"} aria-hidden className={className} />;
  return <img src={url} alt="" fetchPriority={prioridad ? "high" : undefined} loading={prioridad ? undefined : "lazy"} decoding="async" className={className} />;
}
