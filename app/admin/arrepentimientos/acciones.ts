"use server";
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

export async function resolver(id: number, estado: "resuelto" | "rechazado", resolucion: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("resolver_arrepentimiento", { p_id: id, p_estado: estado, p_resolucion: resolucion.trim().slice(0, 500) || undefined });
  if (error) return { error: error.message };
  revalidatePath("/admin/arrepentimientos");
  return { ok: estado === "resuelto" ? "Marcado como resuelto" : "Rechazado" };
}
