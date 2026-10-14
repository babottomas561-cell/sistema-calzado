"use server";
import { ESTILOS, esEstilo } from "@/lib/estilos";
// Tienda online: las secciones de la portada y los datos de la tienda. Lo que se puede hacer lo
// controla la base (permiso tienda.editar); acá se valida la forma de cada sección (lib/inicio.ts).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { sirveParaBotones } from "@/lib/color";
import { enlaceValido, leerContenido, NUEVA, TIPOS, type Tipo } from "@/lib/inicio";

export type Estado = { error?: string; ok?: string };

const texto = (f: FormData, campo: string, max = 200) => String(f.get(campo) ?? "").trim().slice(0, max);
function refrescar() { revalidatePath("/admin/tienda"); revalidatePath("/", "layout"); }

// Si una foto subida deja de usarse, se borra del bucket (las de links externos no)
async function borrarFoto(supabase: Awaited<ReturnType<typeof crearCliente>>, ruta: string | null | undefined) {
  if (ruta) await supabase.storage.from("tienda").remove([ruta]);
}

export async function guardarSeccion(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const id = Number(f.get("id"));
  const { data: antes } = await supabase.from("inicio_secciones").select("tipo, imagen_ruta").eq("id", id).single();
  if (!antes) return { error: "No se encontró la sección (¿la borró alguien?)" };
  const tipo = antes.tipo as Tipo;

  let contenido: unknown = {};
  try { contenido = JSON.parse(String(f.get("contenido") ?? "{}")); } catch { return { error: "No se pudo leer la sección. Probá de nuevo." }; }
  const boton_enlace = texto(f, "boton_enlace", 300);
  if (boton_enlace && !enlaceValido(boton_enlace)) return { error: "El link del botón tiene que empezar con / (una página de la tienda) o con https://" };
  const imagen_url = texto(f, "imagen_url", 500) || null;
  const imagen_ruta = imagen_url ? texto(f, "imagen_ruta", 300) || null : null;
  if ((tipo === "banner" || tipo === "editorial") && !imagen_url) return { error: `${tipo === "banner" ? "El banner" : "El bloque editorial"} necesita una foto` };

  const { error } = await supabase.from("inicio_secciones").update({
    titulo: texto(f, "titulo", 120) || null, bajada: texto(f, "bajada", 300) || null,
    boton_texto: texto(f, "boton_texto", 40) || null, boton_enlace: boton_enlace || null,
    imagen_url, imagen_ruta, contenido: leerContenido(tipo, contenido),
  }).eq("id", id);
  if (error) return { error: error.message };
  if (antes.imagen_ruta && antes.imagen_ruta !== imagen_ruta) await borrarFoto(supabase, antes.imagen_ruta);
  refrescar();
  return { ok: "Guardado. Ya se ve en la tienda." };
}

export async function crearSeccion(tipo: string): Promise<Estado> {
  if (!TIPOS.includes(tipo as Tipo)) return { error: "Tipo de sección desconocido" };
  const supabase = await crearCliente();
  const { data: ultima } = await supabase.from("inicio_secciones").select("orden").order("orden", { ascending: false }).limit(1).maybeSingle();
  const base = NUEVA[tipo as Tipo];
  // Las nuevas entran al final pero antes del local (que suele cerrar la página)
  const { error } = await supabase.from("inicio_secciones").insert({
    tipo, orden: (ultima?.orden ?? 0) + 10, titulo: base.titulo, bajada: base.bajada ?? null,
    boton_texto: base.boton_texto ?? null, boton_enlace: base.boton_enlace ?? null, contenido: base.contenido,
    visible: tipo !== "banner" && tipo !== "editorial",   // arrancan apagados hasta que tengan foto
  });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Sección agregada al final" };
}

// Sube o baja una sección: intercambia el orden con la vecina
export async function moverSeccion(id: number, dir: 1 | -1): Promise<Estado> {
  const supabase = await crearCliente();
  const { data } = await supabase.from("inicio_secciones").select("id, orden").order("orden").order("id");
  const lista = data ?? [];
  const i = lista.findIndex((s) => s.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= lista.length) return {};
  // Se renumera de 10 en 10 para que nunca queden dos con el mismo orden
  [lista[i], lista[j]] = [lista[j], lista[i]];
  for (const [k, s] of lista.entries()) {
    if (s.orden !== (k + 1) * 10) {
      const { error } = await supabase.from("inicio_secciones").update({ orden: (k + 1) * 10 }).eq("id", s.id);
      if (error) return { error: error.message };
    }
  }
  refrescar();
  return {};
}

export async function mostrarSeccion(id: number, visible: boolean): Promise<Estado> {
  const supabase = await crearCliente();
  if (visible) {
    const { data } = await supabase.from("inicio_secciones").select("tipo, imagen_url").eq("id", id).single();
    if ((data?.tipo === "banner" || data?.tipo === "editorial") && !data.imagen_url) return { error: "Primero ponele una foto" };
  }
  const { error } = await supabase.from("inicio_secciones").update({ visible }).eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return {};
}

export async function borrarSeccion(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { data } = await supabase.from("inicio_secciones").delete().eq("id", id).select("imagen_ruta").maybeSingle();
  await borrarFoto(supabase, data?.imagen_ruta);
  refrescar();
  return { ok: "Sección borrada" };
}

// Datos de la tienda: nombre, aviso, redes y lo que ve el cliente al hacer un pedido
export async function guardarTienda(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  // El número va solo con dígitos (con código de país y área): "+54 9 381 555-1234" → 5493815551234
  const whatsapp = texto(f, "whatsapp").replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) return { error: "El WhatsApp tiene que tener entre 10 y 15 dígitos, con el 54 y el código de área (ej.: 549 381 555-1234)" };
  // Instagram: sirve pegar el link entero, con o sin @
  const instagram = texto(f, "instagram").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/[@/]/g, "").split("?")[0];
  if (instagram && !/^[A-Za-z0-9._]{1,30}$/.test(instagram)) return { error: "El usuario de Instagram solo lleva letras, números, punto y guion bajo" };
  const aviso_enlace = texto(f, "aviso_enlace", 300);
  if (aviso_enlace && !enlaceValido(aviso_enlace)) return { error: "El link del aviso tiene que empezar con / o con https://" };
  const dias_retiro = Math.round(Number(f.get("dias_retiro")));
  if (!(dias_retiro >= 1 && dias_retiro <= 90)) return { error: "Los días para retirar van de 1 a 90" };
  const dias_cambio = Math.round(Number(f.get("dias_cambio"))), dias_saldo = Math.round(Number(f.get("dias_saldo")));
  if (!(dias_cambio >= 1 && dias_cambio <= 365)) return { error: "El plazo de cambios va de 1 a 365 días" };
  if (!(dias_saldo >= 7 && dias_saldo <= 730)) return { error: "El vencimiento del saldo va de 7 a 730 días" };
  // Avisos: uno por renglón, hasta 5 (rotan en la barra de arriba)
  const avisos = String(f.get("avisos") ?? "").split("\n").map((a) => a.trim()).filter(Boolean);
  if (avisos.length > 5) return { error: "Hasta 5 avisos (uno por renglón)" };
  if (avisos.some((a) => a.length > 120)) return { error: "Cada aviso puede tener hasta 120 letras" };

  const { error } = await supabase.from("configuracion_tienda").update({
    dias_retiro, dias_cambio, dias_saldo, nombre: texto(f, "nombre") || "Mi Tienda", whatsapp: whatsapp || null, instagram: instagram || null,
    avisos, aviso_enlace: aviso_enlace || null,
    direccion_retiro: texto(f, "direccion_retiro") || null, horario: texto(f, "horario") || null,
  }).eq("unica", true);
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Datos de la tienda guardados" };
}

// El ícono de la pestaña: lo sube el navegador al bucket «tienda» (ya achicado a 256×256 PNG); acá se guarda y se
// borra el anterior. Sin url = volver a la inicial de la tienda.
export async function guardarIcono(url: string | null, ruta: string | null): Promise<Estado> {
  const supabase = await crearCliente();
  if (url && !url.startsWith("https://") && !url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) return { error: "La imagen no es válida" };
  const { data: antes } = await supabase.from("configuracion_tienda").select("icono_ruta").single();
  const { error } = await supabase.from("configuracion_tienda").update({ icono_url: url, icono_ruta: ruta }).eq("unica", true);
  if (error) return { error: error.message };
  if (antes?.icono_ruta && antes.icono_ruta !== ruta) await borrarFoto(supabase, antes.icono_ruta);
  refrescar();
  return { ok: url ? "Ícono guardado (en la pestaña se ve al recargar)" : "Volvió a la inicial de la tienda" };
}

// Logo de la tienda (claro, o el de fondo oscuro para la cabecera sobre una foto): lo sube el navegador al bucket «tienda»
// y acá se guarda y se borra el anterior. Sin url = volver al nombre en letras.
export async function guardarLogo(cual: "claro" | "oscuro", url: string | null, ruta: string | null): Promise<Estado> {
  const supabase = await crearCliente();
  if (url && !url.startsWith("https://") && !url.startsWith("http://127.0.0.1") && !url.startsWith("http://localhost")) return { error: "La imagen no es válida" };
  const { data: antes } = await supabase.from("configuracion_tienda").select("logo_ruta, logo_oscuro_ruta").single();
  const { error } = await supabase.from("configuracion_tienda").update(
    cual === "claro" ? { logo_url: url, logo_ruta: ruta } : { logo_oscuro_url: url, logo_oscuro_ruta: ruta }).eq("unica", true);
  if (error) return { error: error.message };
  const rutaVieja = cual === "claro" ? antes?.logo_ruta : antes?.logo_oscuro_ruta;
  if (rutaVieja && rutaVieja !== ruta) await borrarFoto(supabase, rutaVieja);
  refrescar();
  return { ok: url ? "Logo guardado" : "Volvió al nombre en letras" };
}

// Color de la marca (#rrggbb): vacío = el de siempre. Tiene que dejar leer el texto blanco de los botones.
export async function guardarColor(hex: string | null): Promise<Estado> {
  if (hex !== null && !sirveParaBotones(hex)) return { error: "Ese color es muy claro: el texto blanco de los botones no se lee. Elegí uno más oscuro." };
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda").update({ color_marca: hex }).eq("unica", true);
  if (error) return { error: error.message };
  refrescar();
  return { ok: hex ? "Color guardado" : "Volvió al color de siempre" };
}

// Estilo de la tienda (clásico, editorial, urbano): cambia títulos, bordes y movimiento sin tocar el contenido
export async function guardarEstilo(estilo: string): Promise<Estado> {
  if (!esEstilo(estilo)) return { error: "Ese estilo no existe" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_tienda").update({ estilo }).eq("unica", true);
  if (error) return { error: error.message };
  refrescar();
  return { ok: `Listo: la tienda ahora es ${ESTILOS[estilo].nombre}` };
}
