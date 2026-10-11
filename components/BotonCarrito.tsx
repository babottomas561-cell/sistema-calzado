"use client";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCarrito } from "@/lib/carrito";

export default function BotonCarrito() {
  const { cantidad } = useCarrito();
  return (
    <Link href="/carrito" className="relative inline-flex items-center gap-2 rounded-lg border border-borde bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
      <ShoppingCart size={17} /> <span className="hidden sm:inline">Carrito</span>
      {cantidad > 0 && <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-marca px-1 text-xs text-white">{cantidad}</span>}
    </Link>
  );
}
