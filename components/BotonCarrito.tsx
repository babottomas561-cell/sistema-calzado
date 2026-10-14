"use client";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCarrito } from "@/lib/carrito";

export default function BotonCarrito() {
  const { cantidad } = useCarrito();
  return (
    <Link id="boton-carrito" href="/carrito" aria-label={cantidad > 0 ? `Carrito, ${cantidad} ${cantidad === 1 ? "producto" : "productos"}` : "Carrito"}
      className="relative grid h-11 w-11 place-items-center rounded-sm hover:bg-marca-suave">
      <ShoppingBag size={22} strokeWidth={1.8} />
      {cantidad > 0 && <span key={cantidad} className="contador-pop absolute right-0.5 top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-acento px-1 text-[0.7rem] font-bold leading-none text-white">{cantidad}</span>}
    </Link>
  );
}
