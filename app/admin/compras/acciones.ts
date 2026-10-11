"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string };

export async function registrarCompra(_: Estado, f: FormData): Promise<Estado> {
  const compra = JSON.parse(String(f.get("compra") ?? "{}"));
  if (!compra.items?.length) return { error: "Agregá al menos un producto" };
  const supabase = await crearCliente();
  // registrar_compra (en la base) suma el stock, deja el historial y actualiza el precio de compra
  // del artículo y el de ese proveedor
  const { data: id, error } = await supabase.rpc("registrar_compra", {
    p_items: compra.items, p_proveedor: compra.proveedor_id || undefined,
    p_notas: compra.notas || undefined, p_actualizar_costo: compra.actualizar_costo,
    p_comprobante_proveedor: compra.comprobante_proveedor || undefined,
    p_fecha_comprobante: compra.fecha_comprobante || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/admin/compras/${id}?nueva=1`);
}
