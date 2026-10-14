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

export type ListaPrecioFila = {
  id: number;
  codigo: string;
  nombre: string;
  canal: string;
  ajuste_pct: number;
  redondeo: string;
  activa: boolean;
  es_default_local: boolean;
  es_default_web: boolean;
};

export async function actualizarListaPrecio(
  id: number,
  datos: { nombre?: string; ajuste_pct?: number; redondeo?: string; activa?: boolean }
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("listas_precios").update({
    nombre: datos.nombre,
    ajuste_pct: datos.ajuste_pct,
    redondeo: datos.redondeo,
    activa: datos.activa,
    actualizado_en: new Date().toISOString(),
  }).eq("id", id);

  if (error) return { error: error.message };
  revalidatePath("/admin/precios");
  revalidatePath("/admin/ventas/nueva");
  revalidatePath("/");
  return { ok: true };
}

export async function guardarPrecioExcepcion(
  listaId: number,
  productoId: number,
  precio: number | null
): Promise<{ ok?: boolean; error?: string }> {
  const supabase = await crearCliente();
  if (precio === null || precio === undefined || precio < 0) {
    const { error } = await supabase.from("lista_precio_items").delete()
      .eq("lista_id", listaId)
      .eq("producto_id", productoId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("lista_precio_items").upsert({
      lista_id: listaId,
      producto_id: productoId,
      precio: precio,
    }, { onConflict: "lista_id,producto_id" });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/precios");
  revalidatePath("/admin/ventas/nueva");
  revalidatePath("/");
  return { ok: true };
}

