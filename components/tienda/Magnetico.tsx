"use client";
// Un botón que se «acerca» al cursor cuando pasa cerca y vuelve a su lugar al irse. Solo con mouse y sin «menos movimiento».
import { useRef } from "react";

export default function Magnetico({ children, fuerza = 0.3 }: { children: React.ReactNode; fuerza?: number }) {
  const caja = useRef<HTMLSpanElement>(null);
  const mover = (e: React.PointerEvent) => {
    const el = caja.current;
    if (!el || e.pointerType !== "mouse" || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${((e.clientX - (r.left + r.width / 2)) * fuerza).toFixed(1)}px, ${((e.clientY - (r.top + r.height / 2)) * fuerza).toFixed(1)}px)`;
  };
  return (
    <span ref={caja} onPointerMove={mover} onPointerLeave={() => { if (caja.current) caja.current.style.transform = ""; }}
      className="inline-block transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none">{children}</span>
  );
}
