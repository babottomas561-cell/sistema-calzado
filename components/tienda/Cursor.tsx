"use client";
// Burbuja que sigue al mouse sobre lo que lleva data-cursor="Ver" (fotos de productos, accesos…), como en las tiendas de moda.
// Solo con mouse y sin «menos movimiento». La flecha normal sigue visible: es un agregado, no la reemplaza.
import { useEffect, useRef } from "react";

export default function Cursor() {
  const burbuja = useRef<HTMLDivElement>(null);
  const texto = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
    const b = burbuja.current!;
    let x = 0, y = 0, bx = 0, by = 0, visible = false, raf = 0;
    const seguir = () => {
      bx += (x - bx) * 0.22; by += (y - by) * 0.22;   // llega con un pequeño retraso, más natural que pegado al puntero
      b.style.transform = `translate3d(${bx}px, ${by}px, 0) translate(-50%, -50%) scale(${visible ? 1 : 0})`;
      raf = requestAnimationFrame(seguir);
    };
    const mover = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x = e.clientX; y = e.clientY;
      const el = (e.target as Element | null)?.closest?.("[data-cursor]");
      visible = !!el;
      if (el && texto.current) texto.current.textContent = el.getAttribute("data-cursor");
    };
    const salir = () => { visible = false; };
    document.addEventListener("pointermove", mover, { passive: true });
    document.documentElement.addEventListener("pointerleave", salir);
    raf = requestAnimationFrame(seguir);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("pointermove", mover); document.documentElement.removeEventListener("pointerleave", salir); };
  }, []);
  return (
    <div ref={burbuja} aria-hidden className="pointer-events-none fixed left-0 top-0 z-40 grid h-20 w-20 scale-0 place-items-center rounded-full bg-white/95 text-sm font-bold text-marca shadow-lg backdrop-blur-sm will-change-transform">
      <span ref={texto} />
    </div>
  );
}
