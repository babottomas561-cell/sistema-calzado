"use server";
// Módulos del sistema: qué partes usa este local. La base guarda lo apagado y controla el permiso.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { ITEMS } from "@/lib/menu";

export type Estado = { error?: string; ok?: string };

export async function guardarModulos(_: Estado, f: FormData): Promise<Estado> {
  const encendidos = new Set(f.getAll("encendido").map(String));
  // Solo se apagan los que existen y no son fijos (lo que no vino tildado, se apaga)
  const apagados = ITEMS.filter((i) => !i.fijo && !encendidos.has(i.href)).map((i) => i.href);
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("configurar_modulos", { p_desactivados: apagados });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: apagados.length ? `Listo: ${apagados.length} ${apagados.length === 1 ? "sección apagada" : "secciones apagadas"}` : "Listo: se usa todo el sistema" };
}
