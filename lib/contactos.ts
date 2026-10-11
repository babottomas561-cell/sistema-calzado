"use server";
// Alta y edición de clientes y proveedores (las dos tablas tienen los mismos campos).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

const TABLAS = ["clientes", "proveedores"] as const;
export type Estado = { error?: string; ok?: string };

export async function guardarContacto(_: Estado, f: FormData): Promise<Estado> {
  const tabla = String(f.get("tabla"));
  if (!TABLAS.includes(tabla as (typeof TABLAS)[number])) return { error: "Tabla inválida" };
  const datos = {
    nombre: String(f.get("nombre") ?? "").trim(),
    telefono: String(f.get("telefono") ?? "").trim() || null,
    email: String(f.get("email") ?? "").trim() || null,
    notas: String(f.get("notas") ?? "").trim() || null,
  };
  if (!datos.nombre) return { error: "Falta el nombre" };
  const supabase = await crearCliente();
  const id = f.get("id");
  const t = tabla as (typeof TABLAS)[number];   // ya validado arriba
  const { error } = id
    ? await supabase.from(t).update(datos).eq("id", Number(id))
    : await supabase.from(t).insert(datos);
  if (error) return { error: error.message };
  revalidatePath(`/${tabla}`);
  return { ok: id ? "Guardado" : `${datos.nombre} agregado` };
}
