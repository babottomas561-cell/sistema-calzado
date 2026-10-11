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
  redirect(`/admin/ventas/${id}?nueva=1`);
}
