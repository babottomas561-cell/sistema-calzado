"use server";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; necesitaIngresar?: boolean };

export async function confirmarPedido(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Para confirmar el pedido tenés que ingresar con tu cuenta.", necesitaIngresar: true };
  const items = JSON.parse(String(f.get("items") ?? "[]")) as { variante_id: number; cantidad: number }[];
  // crear_pedido (en la base) valida stock, usa los precios vigentes y reserva los pares
  const { data: id, error } = await supabase.rpc("crear_pedido", {
    p_items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })),
    p_entrega: String(f.get("entrega")), p_direccion: String(f.get("direccion") ?? "").trim() || undefined,
    p_medio_pago: Number(f.get("medio_pago_id")), p_notas: String(f.get("notas") ?? "").trim() || undefined,
  });
  if (error) return { error: error.message };
  redirect(`/mi-cuenta/pedidos/${id}?nuevo=1`);
}

// Lo que cuesta el carrito según la base: precios vigentes, promociones y el % del medio de pago.
// Es el mismo cálculo que va a usar crear_pedido, así el total que se ve es el que queda.
export type Cotizacion = {
  renglones: { variante_id: number; cantidad: number; precio_unitario: number; descuento_promo: number; promocion: string | null; etiqueta: string | null; total: number }[];
  subtotal: number; descuento_promociones: number; ajuste_pct: number; ajuste_medio_pago: number; total: number;
  sugerencias: { promocion: string; etiqueta: string; faltan: number }[];
};

export async function cotizarCarrito(items: { variante_id: number; cantidad: number }[], medioId: number | null): Promise<Cotizacion | null> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar", { p_items: items, p_medio_pago: medioId ?? undefined, p_canal: "tienda" });
  if (error || !data) return null;
  return data as unknown as Cotizacion;
}
