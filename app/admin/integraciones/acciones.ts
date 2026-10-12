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
  const ia_modelo = texto(f, "ia_modelo", 60);
  const ia_plan = f.get("ia_plan") === "pago" ? "pago" : "gratis";
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda")
    .update({ wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla, ia_modelo, ia_plan }).eq("unica", true);
  if (error) return { error: error.message };
  // Precio y límite gratis del modelo elegido (vacío = sin dato). Si cambia el precio, queda la fecha de hoy.
  const num = (k: string) => { const v = String(f.get(k) ?? "").trim().replace(",", "."); return v === "" ? null : Number(v); };
  const [entrada, salida, limite] = [num("precio_entrada"), num("precio_salida"), num("limite_diario_gratis")];
  if ([entrada, salida].some((v) => v !== null && !(v >= 0))) return { error: "Los precios no pueden ser negativos" };
  if (limite !== null && !(Number.isInteger(limite) && limite > 0)) return { error: "El límite gratis es una cantidad de consultas por día (un número entero)" };
  const { data: antes } = await supabase.from("ia_modelos").select("precio_entrada, precio_salida").eq("id", ia_modelo).single();
  const valor = (v: number | null) => (v === null ? null : Number(v));
  const cambioPrecio = antes && (valor(antes.precio_entrada) !== entrada || valor(antes.precio_salida) !== salida);
  const r = await supabase.from("ia_modelos").update({
    precio_entrada: entrada, precio_salida: salida, limite_diario_gratis: limite,
    ...(cambioPrecio ? { verificado: new Date().toISOString().slice(0, 10), nuevo: false } : {}),
  }).eq("id", ia_modelo);
  if (r.error) return { error: r.error.message };
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

// Pregunta ya a Google qué modelos hay (si no, lo hace solo cada mañana). La respuesta se procesa al abrir la pantalla.
export async function buscarModelos(): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ia_revisar_modelos", { p_pedir: true });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  return { ok: "Consultando a Google… en unos segundos actualizá la página" };
}

// ── Mercado Pago ───────────────────────────────────────────────────────
// La dirección de la tienda (para que Mercado Pago avise y devuelva al cliente) la pone el servidor, no el navegador
const sitio = () => (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export async function guardarMercadoPago(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_mercadopago", {
    p_access_token: texto(f, "mp_access_token", 300), p_webhook_secret: texto(f, "mp_webhook_secret", 300),
    p_sitio_url: sitio(), p_quitar: f.getAll("quitar").map(String),
  });
  if (error) return { error: error.message };
  // Si se cargó un token nuevo, se prueba en el momento (así se ve de quién es la cuenta)
  if (texto(f, "mp_access_token", 300)) await supabase.rpc("mp_probar");
  revalidatePath("/admin/integraciones");
  return { ok: "Mercado Pago guardado" };
}

export async function probarMercadoPago(): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("mp_probar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  const r = data as { ok: boolean; error?: string };
  return r.ok ? { ok: "Conectado con Mercado Pago" } : { error: r.error ?? "Mercado Pago no respondió" };
}

// Cómo cobra la tienda: sin Mercado Pago, como opción o solo online; y cuántas cuotas como máximo
export async function guardarCobro(_: Estado, f: FormData): Promise<Estado> {
  const mp_modo = ["no", "opcional", "obligatorio"].includes(String(f.get("mp_modo"))) ? String(f.get("mp_modo")) : "no";
  const mp_cuotas_max = Math.min(Math.max(Math.round(Number(f.get("mp_cuotas_max")) || 1), 1), 12);
  const supabase = await crearCliente();
  if (mp_modo !== "no") {
    const { data } = await supabase.rpc("estado_mercadopago");
    if (!(data as { token?: string } | null)?.token) return { error: "Primero cargá el Access Token de Mercado Pago" };
  }
  const { error } = await supabase.from("configuracion_tienda").update({ mp_modo, mp_cuotas_max }).eq("unica", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones");
  revalidatePath("/", "layout");
  return { ok: "Cobro de la tienda guardado" };
}
