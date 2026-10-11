"use client";
// Se muestra en la página de un pedido recién confirmado: el carrito ya se convirtió en pedido.
import { useEffect } from "react";
import { useCarrito } from "@/lib/carrito";

export default function VaciarCarrito() {
  const { vaciar } = useCarrito();
  useEffect(() => { vaciar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
