"use client";
// Cabecera de la tienda. En la portada, si arranca con una campaña a pantalla completa, flota
// transparente y en blanco sobre la foto (como las marcas de moda) y se vuelve blanca al bajar.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function Cabecera({ sobreCampana, marcaGigante, children }: { sobreCampana: boolean; marcaGigante: boolean; children: React.ReactNode }) {
  const enPortada = usePathname() === "/" && sobreCampana;
  const [bajo, setBajo] = useState(false);
  const [oculta, setOculta] = useState(false);
  useEffect(() => {
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let anterior = window.scrollY;
    const medir = () => {
      const y = window.scrollY;
      setBajo(y > 24);
      // Al bajar se esconde (más lugar para las fotos) y vuelve apenas se sube un poco; con «menos movimiento» queda siempre
      if (!reducido && Math.abs(y - anterior) > 6) { setOculta(y > 160 && y > anterior); anterior = y; }
    };
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    return () => window.removeEventListener("scroll", medir);
  }, []);
  const transparente = enPortada && !bajo;
  return (
    // Si la campaña ya muestra el nombre gigante, el logo chico se esconde hasta que se baja
    <header data-transparente={transparente || undefined} data-sin-marca={(transparente && marcaGigante) || undefined}
      onFocusCapture={() => setOculta(false)}
      className={`sticky top-0 z-20 border-b transition-[background-color,border-color,color,transform] duration-300 ${oculta ? "-translate-y-full" : ""} ${transparente
        ? "border-transparent bg-transparent text-white"
        : "border-borde bg-white/95 backdrop-blur-sm"}`}>
      {children}
    </header>
  );
}
