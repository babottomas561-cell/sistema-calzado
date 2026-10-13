"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string };

// La venta entera (productos, pagos, cliente) llega como JSON en un solo campo
export async function registrarVenta(_: Estado, f: FormData): Promise<Estado> {
  const venta = JSON.parse(String(f.get("venta") ?? "{}"));
  if (!venta.items?.length) return { error: "Agregá al menos un producto" };
  const supabase = await crearCliente();
  // registrar_venta (en la base) valida stock, descuenta, registra los pagos y deja el historial, todo junto
  const { data: id, error } = await supabase.rpc("registrar_venta", {
    p_items: venta.items, p_pagos: venta.pagos, p_cliente: venta.cliente_id || undefined,
    p_descuento: Number(venta.descuento) || 0, p_canal: venta.canal, p_notas: venta.notas || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  // Qué pasa al confirmar (Impresión → Comprobantes): automática imprime sola, opcional ofrece imprimir o mandar, manual vuelve a la venta
  // (el de quien vende: cada persona del equipo puede tener el suyo)
  const { data: impresion } = await supabase.rpc("impresion_de");
  const modo = impresion?.[0]?.modo ?? "opcional";
  // El vuelto no se guarda: viaja para mostrárselo al cajero en la pantalla siguiente
  const vuelto = Math.max(0, Number(f.get("vuelto")) || 0);
  const extra = vuelto > 0 ? `&vuelto=${vuelto}` : "";
  redirect(modo === "manual" ? `/admin/ventas/${id}?nueva=1${extra}` : `/admin/comprobante/venta/${id}?nueva=1${extra}${modo === "automatica" ? "&imprimir=1" : ""}`);
}

// Promociones del mostrador para lo que se está por vender (las mismas que va a aplicar registrar_venta)
export type CotizacionMostrador = { renglones: { variante_id: number; descuento_promo: number; promocion: string | null; acumula: boolean; total: number }[]; descuento_promociones: number };
export async function cotizarMostrador(items: { variante_id: number; cantidad: number; precio_unitario: number }[]): Promise<CotizacionMostrador | null> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar", { p_items: items, p_canal: "mostrador" });
  return error || !data ? null : (data as unknown as CotizacionMostrador);
}

// Anula una venta del día. La base controla el permiso, el plazo, devuelve el stock y acomoda su pedido o presupuesto.
export async function anularVenta(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const venta = Number(f.get("venta_id"));
  const motivo = String(f.get("motivo") ?? "");
  if (!motivo) return { error: "Elegí el motivo de la anulación" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("anular_venta", { p_venta: venta, p_motivo: motivo, p_comentario: String(f.get("comentario") ?? "").trim() || undefined });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout"); revalidatePath("/", "layout");
  return { ok: "Venta anulada: el stock ya volvió" };
}
