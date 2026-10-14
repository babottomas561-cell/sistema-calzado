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
  // El crédito con el proveedor se descuenta aparte (la base controla saldo y total). Si falla, la compra
  // ya quedó cargada: se avisa y se puede descontar desde su detalle.
  let aviso = "";
  if (Number(compra.credito) > 0) {
    const r = await supabase.rpc("aplicar_credito_proveedor", { p_compra: id, p_monto: Number(compra.credito) });
    if (r.error) aviso = `&credito_error=${encodeURIComponent(r.error.message)}`;
  }
  revalidatePath("/", "layout");
  redirect(`/admin/compras/${id}?nueva=1${aviso}`);
}

// Descontar crédito del proveedor de una factura ya cargada
export async function aplicarCredito(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("aplicar_credito_proveedor", { p_compra: Number(f.get("compra_id")), p_monto: Number(f.get("monto")) });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: "Crédito descontado" };
}

// Ajustar a mano el crédito con un proveedor (con nota)
export async function ajustarCredito(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const monto = Number(f.get("monto")) * (f.get("signo") === "menos" ? -1 : 1);
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ajustar_credito_proveedor", { p_proveedor: Number(f.get("proveedor_id")), p_monto: monto, p_nota: String(f.get("nota") ?? "") });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: "Crédito ajustado" };
}

// ── Bultos (plantillas de compra) ──
export type EstadoBulto = { error?: string; ok?: string };

export async function guardarBulto(nombre: string, items: { variante_id: number; cantidad: number }[], proveedor: number | null): Promise<EstadoBulto> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_bulto", { p_nombre: nombre, p_items: items, p_proveedor: (proveedor ?? undefined) as number });
  if (error) return { error: error.message };
  revalidatePath("/admin/compras", "layout");
  return { ok: "Bulto guardado" };
}

export async function quitarBulto(id: number): Promise<EstadoBulto> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("quitar_bulto", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/compras", "layout");
  return { ok: "Bulto quitado" };
}
