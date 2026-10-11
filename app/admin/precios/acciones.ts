"use server";
// Ajuste masivo de precios: la vista previa y el ajuste los calcula la base (ajustar_precios),
// así lo que se ve antes de aplicar es exactamente lo que queda.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Parametros = {
  que: "venta" | "compra"; productos: number[]; modo: "porcentaje" | "monto" | "fijo" | "margen";
  valor: number; redondeo: "ninguno" | "10" | "100" | "1000" | "999"; proveedor: number | null; descripcion: string;
};
export type Cambio = { producto_id: number; codigo: string; nombre: string; precio_anterior: number; precio_nuevo: number };

async function ajustar(p: Parametros, aplicar: boolean): Promise<{ error?: string; cambios?: Cambio[] }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("ajustar_precios", {
    p_que: p.que, p_productos: p.productos, p_modo: p.modo, p_valor: p.valor, p_redondeo: p.redondeo,
    p_proveedor: p.proveedor ?? undefined, p_descripcion: p.descripcion, p_aplicar: aplicar,
  });
  if (error) return { error: error.message };
  return { cambios: (data ?? []).map((c) => ({ ...c, precio_anterior: Number(c.precio_anterior), precio_nuevo: Number(c.precio_nuevo) })) };
}

export async function previsualizar(p: Parametros) {
  return ajustar(p, false);
}

export async function aplicar(p: Parametros) {
  const r = await ajustar(p, true);
  if (!r.error) { revalidatePath("/admin/precios"); revalidatePath("/admin/productos"); revalidatePath("/"); }
  return r;
}

export async function deshacer(id: number): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("deshacer_ajuste_precios", { p_ajuste: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/precios"); revalidatePath("/admin/productos"); revalidatePath("/");
  return { ok: data ? `Listo: ${data === 1 ? "1 artículo volvió" : `${data} artículos volvieron`} a su precio anterior` : "No había nada para volver: esos precios ya se habían cambiado después" };
}
