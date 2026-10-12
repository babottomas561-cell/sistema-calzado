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

// El bot y los avisos de pedidos (con su plantilla de Meta). Van en configuracion_tienda: no son secretos.
export async function guardarAutomatizaciones(_: Estado, f: FormData): Promise<Estado> {
  const wa_bot_activo = f.get("wa_bot_activo") !== null;
  const wa_notificaciones_pedidos = f.get("wa_notificaciones_pedidos") !== null;
  const wa_plantilla_estado = texto(f, "wa_plantilla_estado", 512).toLowerCase() || null;
  const wa_idioma_plantilla = texto(f, "wa_idioma_plantilla", 10) || "es_AR";
  if (wa_plantilla_estado && !/^[a-z0-9_]+$/.test(wa_plantilla_estado)) return { error: "El nombre de la plantilla solo lleva minúsculas, números y guion bajo" };
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(wa_idioma_plantilla)) return { error: "El idioma de la plantilla tiene que tener un formato como es_AR" };
  if (wa_notificaciones_pedidos && !wa_plantilla_estado) return { error: "Para activar los avisos, cargá primero el nombre de la plantilla aprobada por Meta" };
  const ia_modelo = (texto(f, "ia_modelo_otro", 60) || texto(f, "ia_modelo", 60)).toLowerCase();
  if (!/^[a-z0-9][a-z0-9.\-]{2,60}$/.test(ia_modelo)) return { error: "El modelo se escribe como lo nombra Google, por ejemplo gemini-2.5-flash" };
  const ia_precio_entrada = Number(f.get("ia_precio_entrada") || 0), ia_precio_salida = Number(f.get("ia_precio_salida") || 0);
  if (!(ia_precio_entrada >= 0 && ia_precio_salida >= 0)) return { error: "Los precios de la IA no pueden ser negativos" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda")
    .update({ wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla, ia_modelo }).eq("unica", true);
  if (error) return { error: error.message };
  // Los precios van con Gastos (permiso gastos.gestionar): si no lo tiene, no se tocan
  if (f.has("ia_precio_entrada")) {
    const r = await supabase.from("configuracion_gastos").update({ ia_precio_entrada, ia_precio_salida }).eq("id", true);
    if (r.error) return { error: r.error.message };
  }
  revalidatePath("/admin/integraciones");
  return { ok: "Bot y avisos guardados" };
}

// Prueba la clave de Gemini (la consulta sale desde la base; la clave no pasa por acá)
export async function probarGemini(): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ia_probar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  return { ok: "Consultando a Gemini… en unos segundos actualizá la página para ver el resultado" };
}
