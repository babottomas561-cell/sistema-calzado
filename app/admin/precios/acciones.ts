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

// ── Listas de precios (el precio del mostrador y el de la tienda) ──
export async function guardarLista(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const id = Number(f.get("id")) || undefined;
  const { error } = await supabase.rpc("guardar_lista_precios", { p_id: id as number, p_nombre: String(f.get("nombre") ?? "").trim(),
    p_ajuste_pct: Number(String(f.get("ajuste") ?? "0").replace(",", ".")) || 0, p_redondeo: Number(f.get("redondeo")) || 0, p_activa: f.get("activa") !== "no" });
  if (error) return { error: error.message };
  revalidatePath("/admin/precios", "layout");
  return { ok: "Guardado" };
}

export async function quitarLista(id: number): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("quitar_lista_precios", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/precios", "layout");
  return { ok: "Quitada" };
}

export async function configurarListas(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("configurar_listas_precios", { p_activas: f.get("activas") === "on", p_mostrador: (Number(f.get("mostrador")) || undefined) as number, p_tienda: (Number(f.get("tienda")) || undefined) as number });
  if (error) return { error: error.message };
  revalidatePath("/", "layout"); revalidatePath("/admin", "layout");
  return { ok: "Guardado" };
}
