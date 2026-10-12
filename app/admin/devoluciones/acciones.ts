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
