"use server";
// Integraciones: las claves de Meta y de Gemini. Se guardan en la base (guardar_integraciones) y no se vuelven
// a leer; la base controla el permiso. Un campo vacío no toca lo que había; «quitar» borra esa clave.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { leerMonto } from "@/lib/formato";

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
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Conexiones guardadas" };
}

// Manda la plantilla de prueba de Meta («hello_world») a un número: si llega, la conexión anda
export async function probarWhatsApp(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("wa_mensaje_prueba", { p_telefono: texto(f, "telefono", 30) });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Mensaje de prueba enviado: en unos segundos aparece abajo si Meta lo aceptó" };
}

// WhatsApp: el bot y los avisos de pedidos (con su plantilla de Meta). Van en configuracion_tienda: no son secretos.
export async function guardarBotYAvisos(_: Estado, f: FormData): Promise<Estado> {
  const wa_bot_activo = f.get("wa_bot_activo") !== null;
  const wa_notificaciones_pedidos = f.get("wa_notificaciones_pedidos") !== null;
  const wa_plantilla_estado = texto(f, "wa_plantilla_estado", 512).toLowerCase() || null;
  const wa_idioma_plantilla = texto(f, "wa_idioma_plantilla", 10) || "es_AR";
  if (wa_plantilla_estado && !/^[a-z0-9_]+$/.test(wa_plantilla_estado)) return { error: "El nombre de la plantilla solo lleva minúsculas, números y guion bajo" };
  if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(wa_idioma_plantilla)) return { error: "El idioma de la plantilla tiene que tener un formato como es_AR" };
  if (wa_notificaciones_pedidos && !wa_plantilla_estado) return { error: "Para activar los avisos, cargá primero el nombre de la plantilla aprobada por Meta" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda")
    .update({ wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla }).eq("unica", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Bot y avisos guardados" };
}

// IA: el modelo de Gemini, el plan (gratis o pago) y el precio y límite gratis del modelo elegido
export async function guardarIA(_: Estado, f: FormData): Promise<Estado> {
  const ia_modelo = texto(f, "ia_modelo", 60);
  const ia_plan = f.get("ia_plan") === "pago" ? "pago" : "gratis";
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda").update({ ia_modelo, ia_plan }).eq("unica", true);
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
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "IA guardada" };
}

// Prueba la clave de Gemini (la consulta sale desde la base; la clave no pasa por acá)
export async function probarGemini(): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ia_probar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Consultando a Gemini… en unos segundos actualizá la página para ver el resultado" };
}

// Pregunta ya a Google qué modelos hay (si no, lo hace solo cada mañana). La respuesta se procesa al abrir la pantalla.
export async function buscarModelos(): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ia_revisar_modelos", { p_pedir: true });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
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
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Mercado Pago guardado" };
}

export async function probarMercadoPago(): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("mp_probar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
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
  revalidatePath("/admin/integraciones", "layout");
  revalidatePath("/", "layout");
  return { ok: "Cobro de la tienda guardado" };
}

// ── Zonas de envío ─────────────────────────────────────────────────────
// Precio vacío = «a coordinar» (el envío se arregla aparte, por ejemplo al interior)
export async function guardarZona(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const nombre = texto(f, "nombre", 60);
  if (!nombre) return { error: "Poné el nombre de la zona" };
  const precio = leerMonto(texto(f, "precio", 20));
  if (precio !== null && !(precio >= 0)) return { error: "El precio tiene que ser un número (o vacío, para «a coordinar»)" };
  const fila = { nombre, precio, descripcion: texto(f, "descripcion", 200) || null };
  const supabase = await crearCliente();
  const { error } = id ? await supabase.from("zonas_envio").update(fila).eq("id", id) : await supabase.from("zonas_envio").insert(fila);
  if (error) return { error: error.message.includes("zonas_envio_nombre_key") ? "Ya hay una zona con ese nombre" : error.message };
  revalidatePath("/admin/integraciones", "layout"); revalidatePath("/carrito");
  return { ok: id ? "Zona guardada" : "Zona agregada" };
}

export async function activarZona(f: FormData) {
  const supabase = await crearCliente();
  await supabase.from("zonas_envio").update({ activo: f.get("activo") === "1" }).eq("id", Number(f.get("id")));
  revalidatePath("/admin/integraciones", "layout"); revalidatePath("/carrito");
}

// Envíos: ¿hay que pagar antes de que salga? (prendido por defecto; apagado permite pago contra entrega)
export async function guardarReglaEnvio(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda").update({ envio_requiere_pago: f.get("envio_requiere_pago") !== null }).eq("unica", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Guardado" };
}

// ── Uber Direct y Andreani: credenciales (se guardan en la base, no se leen) y su prueba ─────
export async function guardarCredencialesEnvio(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_envios_credenciales", {
    p_uber_customer_id: texto(f, "uber_customer_id", 100), p_uber_client_id: texto(f, "uber_client_id", 200),
    p_uber_client_secret: texto(f, "uber_client_secret", 300), p_andreani_usuario: texto(f, "andreani_usuario", 100),
    p_andreani_clave: texto(f, "andreani_clave", 200), p_andreani_cliente: texto(f, "andreani_cliente", 50),
    p_andreani_contrato: texto(f, "andreani_contrato", 50), p_quitar: f.getAll("quitar").map(String),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Guardado" };
}

export async function probarServicioEnvio(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc(f.get("servicio") === "andreani" ? "probar_andreani" : "probar_uber");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  const r = data as { ok: boolean; error?: string };
  return r.ok ? { ok: "Conectado" } : { error: r.error ?? "No conecta" };
}

// ── Dominio propio (solo el Administrador; la base habla con Vercel y Supabase) ─────
export async function agregarDominio(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("dominio_agregar", { p_nombre: texto(f, "dominio", 100) });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Agregado: ahora cargá los registros que se muestran donde compraste el dominio" };
}

export async function accionDominio(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")), que = String(f.get("que"));
  const supabase = await crearCliente();
  const { error } = que === "principal" ? await supabase.rpc("dominio_principal", { p_id: id })
    : que === "quitar" ? await supabase.rpc("dominio_quitar", { p_id: id }) : await supabase.rpc("dominio_revisar", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: que === "principal" ? "Listo: la tienda ya usa este dominio" : que === "quitar" ? "Quitado" : "Revisado" };
}

export async function guardarHosting(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_conexion_hosting", {
    p_vercel_token: texto(f, "vercel_token", 200), p_vercel_proyecto: texto(f, "vercel_proyecto", 100), p_vercel_equipo: texto(f, "vercel_equipo", 100),
    p_supabase_token: texto(f, "supabase_token", 200), p_supabase_ref: texto(f, "supabase_ref", 40),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  return { ok: "Conexión técnica guardada" };
}

// Correo (SMTP del local): se guarda, y la base se lo pasa a Supabase Auth junto con las plantillas con el nombre de la tienda
export async function guardarCorreo(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_correo", {
    p_host: texto(f, "host", 100), p_puerto: Number(f.get("puerto")) || undefined, p_usuario: texto(f, "usuario", 200),
    p_clave: texto(f, "clave", 300), p_email: texto(f, "email", 200), p_nombre: texto(f, "nombre", 100),
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout");
  const { data, error: errAplicar } = await supabase.rpc("cuentas_aplicar");
  if (errAplicar) return { error: `Se guardó, pero ${errAplicar.message}` };
  if (!(data as { aplicado: boolean }).aplicado) return { ok: "Guardado. Falta la conexión técnica con Supabase (Integraciones → Dominio → Conexión técnica) para que el correo se aplique." };
  return { ok: "Guardado y aplicado: Supabase ya manda los mails por tu servidor de correo" };
}

// Mail de prueba: se pide el cambio de contraseña de quien está logueado, que sale por el mismo camino que el de un cliente
export async function probarCorreo(): Promise<Estado> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "No se pudo saber tu email" };
  const { error } = await supabase.auth.resetPasswordForEmail(user.email);
  if (error) return { error: error.message.includes("rate") ? "Ya se mandó uno hace un momento: esperá un minuto y probá de nuevo" : error.message };
  return { ok: `Te mandamos un mail de prueba a ${user.email} (es el de «cambiar contraseña»; no hace falta usarlo). Si llega, el correo anda. Revisá también spam.` };
}

// ── Instagram: las últimas publicaciones en la portada ──
// El token se verifica contra Meta dentro de la base (tiene que ser una cuenta profesional) y no se vuelve a leer.
export async function conectarInstagram(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("guardar_instagram", { p_token: texto(f, "token", 1000) });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout"); revalidatePath("/", "layout");
  const r = data as { usuario: string; publicaciones: number };
  return { ok: `Conectado: @${r.usuario}. Copiamos ${r.publicaciones} ${r.publicaciones === 1 ? "publicación" : "publicaciones"}.` };
}

export async function sincronizarInstagram(): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("instagram_sincronizar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout"); revalidatePath("/", "layout");
  return { ok: `Actualizado: ${data} ${data === 1 ? "publicación" : "publicaciones"}` };
}

export async function desconectarInstagram(): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("instagram_desconectar");
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones", "layout"); revalidatePath("/", "layout");
  return { ok: "Instagram desconectado" };
}

export async function mostrarPublicacion(id: number, visible: boolean): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("instagram_mostrar", { p_id: id, p_visible: visible });
  if (error) return { error: error.message };
  revalidatePath("/admin/integraciones/instagram"); revalidatePath("/", "layout");
  return { ok: visible ? "Se muestra en la tienda" : "Oculta de la tienda" };
}
