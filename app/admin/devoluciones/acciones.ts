"use server";
// Devoluciones: la cuenta y el registro los hace la base (cotizar_devolucion, registrar_devolucion):
// valida plazo y permisos, devuelve el stock (lo fallado a Fallados) y deja el saldo a favor.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Renglon = { venta_item_id: number; cantidad: number; estado: "bueno" | "fallado" };
export type Cotizacion = { total: number; bruto: number; limite: string; fuera_de_plazo: boolean; vence_saldo: string };

export async function cotizarDevolucion(venta: number, items: Renglon[]): Promise<{ error?: string; cotizacion?: Cotizacion }> {
  const elegidos = items.filter((i) => i.cantidad > 0);
  if (!elegidos.length) return {};
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar_devolucion", { p_venta: venta, p_items: elegidos });
  if (error) return { error: error.message };
  return { cotizacion: data as unknown as Cotizacion };
}

export async function registrarDevolucion(_: { error?: string }, f: FormData): Promise<{ error?: string }> {
  const venta = Number(f.get("venta_id"));
  const items = (JSON.parse(String(f.get("items") ?? "[]")) as Renglon[]).filter((i) => i.cantidad > 0);
  if (!items.length) return { error: "Elegí qué se devuelve" };
  const supabase = await crearCliente();
  const { data: id, error } = await supabase.rpc("registrar_devolucion", {
    p_venta: venta, p_items: items, p_motivo: String(f.get("motivo") ?? ""),
    p_comentario: String(f.get("comentario") ?? "").trim() || undefined,
    p_cliente: Number(f.get("cliente_id")) || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout"); revalidatePath("/", "layout");
  redirect(`/admin/devoluciones/${id}?nueva=1`);
}

// ── Cambios: devolución + venta nueva en una sola operación (registrar_cambio, en la base) ──
export type Lleva = { variante_id: number; cantidad: number };
export type CotizacionCambio = {
  credito: number; total_nuevo: number; usa_saldo: number; diferencia: number; ajuste_medio: number; a_pagar: number; queda_saldo: number;
  limite: string; fuera_de_plazo: boolean; vence_saldo: string;
  lleva: { variante_id: number; cantidad: number; precio_unitario: number; descuento_promo: number; promocion_id: number | null; mismo_articulo: boolean }[];
};

export async function cotizarCambio(venta: number, trae: Renglon[], lleva: Lleva[], medio: number | null): Promise<{ error?: string; cotizacion?: CotizacionCambio }> {
  const t = trae.filter((i) => i.cantidad > 0), l = lleva.filter((i) => i.cantidad > 0);
  if (!t.length || !l.length) return {};
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar_cambio", { p_venta: venta, p_devuelve: t, p_lleva: l, p_medio: medio ?? undefined });
  if (error) return { error: error.message };
  return { cotizacion: data as unknown as CotizacionCambio };
}

export async function registrarCambio(_: { error?: string }, f: FormData): Promise<{ error?: string }> {
  const venta = Number(f.get("venta_id"));
  const trae = (JSON.parse(String(f.get("trae") ?? "[]")) as Renglon[]).filter((i) => i.cantidad > 0);
  const lleva = (JSON.parse(String(f.get("lleva") ?? "[]")) as Lleva[]).filter((i) => i.cantidad > 0);
  if (!trae.length) return { error: "Elegí qué trae" };
  if (!lleva.length) return { error: "Elegí qué se lleva" };
  const medio = Number(f.get("medio_pago_id"));
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("registrar_cambio", {
    p_venta: venta, p_devuelve: trae, p_lleva: lleva, p_pagos: medio ? [{ medio_pago_id: medio }] : [],
    p_motivo: String(f.get("motivo") ?? "talle"), p_comentario: String(f.get("comentario") ?? "").trim() || undefined,
    p_cliente: Number(f.get("cliente_id")) || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout"); revalidatePath("/", "layout");
  redirect(`/admin/ventas/${(data as { venta_id: number }).venta_id}?cambio=1`);
}
