"use server";
// Mi cuenta (equipo): el PIN personal para autorizar excepciones en la caja. La base lo guarda con hash y nadie puede leerlo.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

export async function guardarPin(_: Estado, f: FormData): Promise<Estado> {
  const pin = String(f.get("pin") ?? "").trim(), repetido = String(f.get("repetido") ?? "").trim();
  if (pin !== repetido) return { error: "Los dos PIN no coinciden" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("cambiar_mi_pin", { p_pin: pin });
  if (error) return { error: error.message };
  revalidatePath("/admin/mi-cuenta");
  return { ok: "Listo: tu PIN quedó guardado" };
}
