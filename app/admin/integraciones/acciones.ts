"use server";
// Integraciones: las claves de Meta y de Gemini. Se guardan en la base (guardar_integraciones) y no se vuelven
// a leer; la base controla el permiso. Un campo vacío no toca lo que había; «quitar» borra esa clave.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

type Estado = { error?: string; ok?: string };
const texto = (f: FormData, campo: string, max = 200) => String(f.get(campo) ?? "").trim().slice(0, max);

export async function guardarConexiones(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_integraciones", {
    p_phone_number_id: texto(f, "phone_number_id", 30), p_waba_id: texto(f, "waba_id", 30),
    p_access_token: texto(f, "access_token", 1000), p_app_secret: texto(f, "app_secret", 200),
    p_gemini_api_key: texto(f, "gemini_api_key", 200),
    p_quitar: f.getAll("quitar").map(String),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  return { ok: "Conexiones guardadas" };
}

// Manda la plantilla de prueba de Meta («hello_world») a un número: si llega, la conexión anda
export async function probarWhatsApp(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("wa_mensaje_prueba", { p_telefono: texto(f, "telefono", 30) });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  return { ok: "Mensaje de prueba enviado: en unos segundos aparece abajo si Meta lo aceptó" };
}
