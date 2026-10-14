"use client";
// Burbuja de WhatsApp siempre a mano (como en las tiendas argentinas). En la ficha de producto sube
// un poco en el celular para no tapar la barra de compra fija; en el carrito no aparece (ya está el botón del pedido).
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";

export default function WhatsAppFlotante({ numero }: { numero: string }) {
  const ruta = usePathname();
  if (ruta.startsWith("/carrito") || ruta.startsWith("/mi-cuenta/pedidos")) return null;
  const enFicha = ruta.startsWith("/producto/");
  return (
    <a href={`https://wa.me/${numero}?text=${encodeURIComponent("¡Hola! Quería hacerles una consulta")}`} target="_blank" rel="noopener" aria-label="Escribinos por WhatsApp"
      className={`fixed right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-[#1f9d55] text-white shadow-lg shadow-black/20 transition-transform hover:scale-105 motion-reduce:transition-none sm:bottom-6 sm:right-6 ${enFicha ? "bottom-24 lg:bottom-6" : "bottom-5"}`}>
      <MessageCircle size={26} strokeWidth={2} />
    </a>
  );
}
