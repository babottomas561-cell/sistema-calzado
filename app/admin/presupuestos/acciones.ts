"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string };

// El presupuesto entero llega como JSON en un solo campo. Precios, promociones y totales los pone la base.
export async function crearPresupuesto(_: Estado, f: FormData): Promise<Estado> {
  const p = JSON.parse(String(f.get("presupuesto") ?? "{}"));
  if (!p.items?.length) return { error: "Agregá al menos un producto" };
  const supabase = await crearCliente();
  const { data: id, error } = await supabase.rpc("crear_presupuesto", {
    p_items: p.items, p_cliente: p.cliente_id || undefined, p_medio_pago: p.medio_pago_id || undefined,
    p_descuento: Number(p.descuento) || 0, p_canal: p.canal, p_validez_dias: Number(p.validez) || 7, p_notas: p.notas || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/presupuestos");
  redirect(`/admin/presupuestos/${id}?nuevo=1`);
}

// Lo presupuestado pasa a ser una venta (descuenta el stock en ese momento)
export async function convertirPresupuesto(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data: venta, error } = await supabase.rpc("convertir_presupuesto", {
    p_presupuesto: Number(f.get("id")), p_medio_pago: Number(f.get("medio")) || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  redirect(`/admin/ventas/${venta}?nueva=1`);
}

export async function anularPresupuesto(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("anular_presupuesto", { p_presupuesto: Number(f.get("id")) });
  if (error) return { error: error.message };
  revalidatePath("/admin/presupuestos", "layout");
  redirect(`/admin/presupuestos/${f.get("id")}`);
}

// Promociones para lo que se está por presupuestar (las mismas que va a congelar crear_presupuesto)
export type CotizacionPresupuesto = { renglones: { variante_id: number; descuento_promo: number; promocion: string | null; acumula: boolean; total: number }[]; descuento_promociones: number };
export async function cotizarPresupuesto(items: { variante_id: number; cantidad: number; precio_unitario: number }[]): Promise<CotizacionPresupuesto | null> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar", { p_items: items, p_canal: "mostrador" });
  return error || !data ? null : (data as unknown as CotizacionPresupuesto);
}
