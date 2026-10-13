"use server";
// Módulos del sistema: qué partes usa este local. La base guarda el estado y controla el permiso, los fijos, las dependencias y los datos vigentes.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

export async function guardarModulos(_: Estado, f: FormData): Promise<Estado> {
  const encendidos = new Set(f.getAll("encendido").map(String));
  const supabase = await crearCliente();
  const { data: modulos } = await supabase.from("modulos").select("clave, fijo");
  // Lo que no vino tildado se apaga (los fijos nunca)
  const apagados = (modulos ?? []).filter((m) => !m.fijo && !encendidos.has(m.clave)).map((m) => m.clave);
  const { error } = await supabase.rpc("configurar_modulos", { p_desactivados: apagados });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: apagados.length ? `Listo: ${apagados.length} ${apagados.length === 1 ? "parte apagada" : "partes apagadas"}` : "Listo: se usa todo el sistema" };
}
