"use server";
// Fallados: mover stock a la bandeja y resolver cada tanda. Todo lo hace la base (mover_a_fallados,
// resolver_fallado): controla el permiso, mueve el stock con sus movimientos y guarda el costo.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

function refrescar(productoId?: FormDataEntryValue | null) {
  revalidatePath("/admin/fallados");
  if (productoId) revalidatePath(`/admin/productos/${productoId}`);
  revalidatePath("/", "layout");   // la tienda deja de ofrecer (o vuelve a ofrecer) esas unidades
}

export async function moverAFallados(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("mover_a_fallados", {
    p_variante: Number(f.get("variante_id")), p_cantidad: Number(f.get("cantidad")), p_motivo: String(f.get("motivo") ?? ""),
  });
  if (error) return { error: error.message };
  refrescar(f.get("producto_id"));
  return { ok: "Movido a fallados: ya no se ofrece para vender" };
}

export async function resolverFallado(_: Estado, f: FormData): Promise<Estado> {
  const salida = String(f.get("salida") ?? "");
  if (!salida) return { error: "Elegí qué pasó" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("resolver_fallado", {
    p_fallado: Number(f.get("fallado_id")), p_salida: salida, p_cantidad: Number(f.get("cantidad")) || undefined,
    p_proveedor: salida === "proveedor" ? Number(f.get("proveedor_id")) || undefined : undefined,
    p_nota: String(f.get("nota") ?? "").trim() || undefined,
  });
  if (error) return { error: error.message };
  refrescar();
  return { ok: salida === "arreglado" ? "Volvió a la venta" : salida === "proveedor" ? "Anotado como devuelto al proveedor" : "Dado de baja" };
}
