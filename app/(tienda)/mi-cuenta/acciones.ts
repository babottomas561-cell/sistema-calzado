"use server";
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export async function guardarMisDatos(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tenés que ingresar" };
  const t = (k: string) => String(f.get(k) ?? "").trim() || null;
  // Lo hace la base (actualizar_mi_ficha): el cliente no toca la tabla clientes, así no ve ni
  // cambia lo interno del CRM (notas, etiquetas)
  const { error } = await supabase.rpc("actualizar_mi_ficha", {
    p_nombre: String(f.get("nombre") ?? "").trim(), p_documento: t("documento") ?? undefined, p_telefono: t("telefono") ?? undefined,
    p_direccion: t("direccion") ?? undefined, p_localidad: t("localidad") ?? undefined, p_fecha_nacimiento: t("fecha_nacimiento") ?? undefined,
    p_acepta_promos: f.get("acepta_promos") === "on",
  });
  if (error) return { error: error.message };
  revalidatePath("/mi-cuenta");
  return { ok: "Datos guardados" };
}

// El cliente cancela su pedido. La base controla que sea suyo y que el local no lo haya empezado a preparar.
export async function cancelarMiPedido(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const pedido = Number(f.get("pedido_id"));
  const { error } = await supabase.rpc("cancelar_mi_pedido", {
    p_pedido: pedido, p_motivo: String(f.get("motivo") ?? "arrepentido"), p_comentario: String(f.get("comentario") ?? "").trim() || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/mi-cuenta"); revalidatePath(`/mi-cuenta/pedidos/${pedido}`);
  return { ok: "Cancelaste el pedido" };
}
