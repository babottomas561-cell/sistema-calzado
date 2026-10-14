"use client";
// Inclina la foto hacia donde apunta el mouse (máx. 5°) y le pasa un brillo suave. Solo con mouse y sin «menos movimiento»:
// en el celular y con el teclado queda quieta. Patrón de las tarjetas «tilt» de Magic UI / React Bits (MIT), escrito sin librerías.
import { useRef } from "react";

const MAX = 5;

export default function Inclinar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const activo = () => window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches;
  const mover = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = caja.current;
    if (!el || e.pointerType !== "mouse" || !activo()) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${((0.5 - y) * 2 * MAX).toFixed(2)}deg) rotateY(${((x - 0.5) * 2 * MAX).toFixed(2)}deg) scale(1.015)`;
    el.style.setProperty("--bx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--by", `${(y * 100).toFixed(1)}%`);
  };
  const soltar = () => { if (caja.current) caja.current.style.transform = ""; };
  return (
    <div ref={caja} onPointerMove={mover} onPointerLeave={soltar} className={`inclinar ${className}`}>
      {children}
      <span aria-hidden className="brillo-tarjeta pointer-events-none absolute inset-0" />
    </div>
  );
}
