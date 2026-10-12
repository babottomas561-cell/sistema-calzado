"use server";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; necesitaIngresar?: boolean };

export async function confirmarPedido(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Para confirmar el pedido tenés que ingresar con tu cuenta.", necesitaIngresar: true };
  // Si hay términos o privacidad vigentes que todavía no aceptó, tiene que tildar la casilla
  const { data: pendientes } = await supabase.rpc("documentos_pendientes");
  if (Array.isArray(pendientes) && pendientes.length > 0 && !f.get("terminos")) return { error: "Para confirmar tenés que aceptar los términos y condiciones." };
  const items = JSON.parse(String(f.get("items") ?? "[]")) as { variante_id: number; cantidad: number }[];
  // crear_pedido (en la base) valida stock, usa los precios vigentes y reserva los pares
  const { data: id, error } = await supabase.rpc("crear_pedido", {
    p_items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })),
    p_entrega: String(f.get("entrega")), p_direccion: String(f.get("direccion") ?? "").trim() || undefined,
    p_medio_pago: Number(f.get("medio_pago_id")), p_notas: String(f.get("notas") ?? "").trim() || undefined,
    // Solo la zona: su precio lo pone la base
    p_zona: f.get("entrega") === "envio" && Number(f.get("zona_id")) ? Number(f.get("zona_id")) : undefined,
  });
  if (error) return { error: error.message };
  // Queda constancia de qué versión aceptó al comprar (el pedido ya está creado: si esto fallara, no se pierde la compra)
  if (Array.isArray(pendientes) && pendientes.length > 0) await supabase.rpc("aceptar_documentos_compra", { p_pedido: id });
  // Con Mercado Pago: la base arma el cobro (con el total que ella calculó) y se va a pagar
  if (f.get("pagar_online") === "1") {
    const { data: link, error: e } = await supabase.rpc("mp_pagar_pedido", { p_pedido: id });
    if (!e && link) redirect(link);
    redirect(`/mi-cuenta/pedidos/${id}?nuevo=1&pago=error`);
  }
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
