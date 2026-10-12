"use server";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; codigo?: string; valores?: Record<string, string> };

// Deja constancia del arrepentimiento (no hace falta cuenta) y devuelve el código que el cliente guarda
export async function arrepentirse(_: Estado, f: FormData): Promise<Estado> {
  const campo = (n: string) => String(f.get(n) ?? "").trim();
  const valores = { nombre: campo("nombre"), email: campo("email"), telefono: campo("telefono"), comprobante: campo("comprobante"), detalle: campo("detalle") };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("registrar_arrepentimiento", {
    p_nombre: valores.nombre, p_email: valores.email, p_telefono: valores.telefono || undefined,
    p_comprobante: valores.comprobante || undefined, p_detalle: valores.detalle.slice(0, 1000) || undefined,
  });
  if (error) return { error: error.message, valores };
  return { codigo: data as string, valores };
}
