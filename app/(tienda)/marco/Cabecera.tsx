"use client";
// Cabecera de la tienda. En la portada, si arranca con una campaña a pantalla completa, flota
// transparente y en blanco sobre la foto (como las marcas de moda) y se vuelve blanca al bajar.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function Cabecera({ sobreCampana, marcaGigante, children }: { sobreCampana: boolean; marcaGigante: boolean; children: React.ReactNode }) {
  const enPortada = usePathname() === "/" && sobreCampana;
  const [bajo, setBajo] = useState(false);
  useEffect(() => {
    if (!enPortada) return;
    const medir = () => setBajo(window.scrollY > 24);
    medir();
    window.addEventListener("scroll", medir, { passive: true });
    return () => window.removeEventListener("scroll", medir);
  }, [enPortada]);
  const transparente = enPortada && !bajo;
  return (
    // Si la campaña ya muestra el nombre gigante, el logo chico se esconde hasta que se baja
    <header data-transparente={transparente || undefined} data-sin-marca={(transparente && marcaGigante) || undefined}
      className={`sticky top-0 z-20 border-b transition-colors duration-300 ${transparente
        ? "border-transparent bg-transparent text-white"
        : "border-borde bg-white/95 backdrop-blur-sm"}`}>
      {children}
    </header>
  );
}
