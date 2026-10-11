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
