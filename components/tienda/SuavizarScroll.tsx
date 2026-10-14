"use client";
// Scroll suave en la tienda (Lenis, MIT: https://github.com/darkroomengineering/lenis). Solo en el navegador y solo si la
// persona no pidió menos movimiento. En el celular Lenis no toca el desplazamiento táctil (queda el nativo).
// Una zona con su propio scroll vertical (miniaturas, un cajón) lleva data-lenis-prevent para que siga andando normal.
import { useEffect } from "react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

export default function SuavizarScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ autoRaf: true, anchors: true, lerp: 0.12 });
    return () => lenis.destroy();
  }, []);
  return <div className="progreso-scroll" aria-hidden />;
}
