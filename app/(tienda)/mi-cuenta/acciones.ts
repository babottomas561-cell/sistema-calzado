"use server";
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export async function guardarMisDatos(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Tenés que ingresar" };
  const t = (k: string) => String(f.get(k) ?? "").trim() || null;
  // La base deja cambiar estos datos; los campos internos (notas, etiquetas) los protege un trigger
  const { error } = await supabase.from("clientes").update({
    nombre: String(f.get("nombre") ?? "").trim(), documento: t("documento"), telefono: t("telefono"),
    direccion: t("direccion"), localidad: t("localidad"), fecha_nacimiento: t("fecha_nacimiento"),
    acepta_promos: f.get("acepta_promos") === "on",
  }).eq("usuario_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/mi-cuenta");
  return { ok: "Datos guardados" };
}
