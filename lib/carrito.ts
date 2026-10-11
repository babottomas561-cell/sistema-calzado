"use client";
// Carrito de la tienda: vive en el navegador del cliente (localStorage) hasta que confirma el pedido.
// Los precios que guarda son solo para mostrar: al confirmar, la base usa los precios vigentes.
import { useEffect, useState } from "react";

export type ItemCarrito = { variante_id: number; producto_id: number; nombre: string; talle: string; color: string; precio: number; cantidad: number; disponible: number };
const CLAVE = "carrito";

function leer(): ItemCarrito[] {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? "[]"); } catch { return []; }
}
function guardar(items: ItemCarrito[]) {
  try { localStorage.setItem(CLAVE, JSON.stringify(items)); } catch { /* modo privado: el carrito no persiste */ }
  window.dispatchEvent(new Event(CLAVE));   // avisa al ícono del carrito
}

export function useCarrito() {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  useEffect(() => {
    const actualizar = () => setItems(leer());
    actualizar();
    window.addEventListener(CLAVE, actualizar);
    window.addEventListener("storage", actualizar);   // otras pestañas
    return () => { window.removeEventListener(CLAVE, actualizar); window.removeEventListener("storage", actualizar); };
  }, []);

  return {
    items,
    cantidad: items.reduce((s, i) => s + i.cantidad, 0),
    total: items.reduce((s, i) => s + i.cantidad * i.precio, 0),
    agregar: (nuevo: Omit<ItemCarrito, "cantidad">, cantidad = 1) => {
      const actuales = leer();
      const ya = actuales.find((i) => i.variante_id === nuevo.variante_id);
      guardar(ya ? actuales.map((i) => i.variante_id === nuevo.variante_id ? { ...i, cantidad: Math.min(i.cantidad + cantidad, nuevo.disponible) } : i)
                 : [...actuales, { ...nuevo, cantidad: Math.min(cantidad, nuevo.disponible) }]);
    },
    cambiar: (varianteId: number, cantidad: number) =>
      guardar(leer().map((i) => i.variante_id === varianteId ? { ...i, cantidad: Math.max(1, Math.min(cantidad, i.disponible)) } : i)),
    quitar: (varianteId: number) => guardar(leer().filter((i) => i.variante_id !== varianteId)),
    vaciar: () => guardar([]),
  };
}
