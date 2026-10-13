"use server";
// Impresión: crear, ajustar, duplicar y elegir las plantillas de etiquetas, y cómo salen los comprobantes. La base valida los rangos, el nombre
// único y que la grilla entre en la hoja; acá se traducen los errores. Solo quien edita Tablas.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import type { Json } from "@/lib/database.types";
import { esFormato } from "@/lib/comprobante";

export type Estado = { error?: string; ok?: string };

const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "").replace(",", ".").trim());
const si = (f: FormData, k: string) => f.get(k) === "on";

function leerFormulario(f: FormData) {
  const hoja = f.get("tipo") === "hoja";
  return {
    nombre: String(f.get("nombre") ?? "").trim(), tipo: hoja ? "hoja" : "rollo", pagina: hoja ? (f.get("pagina") === "Carta" ? "Carta" : "A4") : null,
    ancho_mm: num(f, "ancho_mm"), alto_mm: num(f, "alto_mm"), columnas: Math.round(num(f, "columnas")) || 1, filas: hoja ? Math.round(num(f, "filas")) || 1 : 1,
    margen_superior_mm: hoja ? num(f, "margen_superior_mm") || 0 : 0, margen_izquierdo_mm: hoja ? num(f, "margen_izquierdo_mm") || 0 : 0,
    separacion_h_mm: num(f, "separacion_h_mm") || 0, separacion_v_mm: hoja ? num(f, "separacion_v_mm") || 0 : 0,
    mostrar_tienda: si(f, "mostrar_tienda"), mostrar_nombre: si(f, "mostrar_nombre"), mostrar_marca: si(f, "mostrar_marca"),
    mostrar_talle_color: si(f, "mostrar_talle_color"), mostrar_precio: si(f, "mostrar_precio"), mostrar_codigo: si(f, "mostrar_codigo"),
    tamano_texto: num(f, "tamano_texto") || 7, tamano_precio: num(f, "tamano_precio") || 11, tipo_codigo: f.get("tipo_codigo") === "code128" ? "code128" : "auto",
    alto_codigo_mm: num(f, "alto_codigo_mm") || 9,
  };
}

function traducir(e: { message: string; code?: string }) {
  if (e.code === "23505") return "Ya hay una plantilla con ese nombre";
  if (e.code === "23514") return "Alguna medida está fuera de lo permitido: revisá los tamaños (la etiqueta mide entre 15 y 200 mm de ancho y entre 10 y 200 mm de alto)";
  if (e.code === "42501") return "No tenés permiso para cambiar las plantillas";
  return e.message;
}
const refrescar = () => { revalidatePath("/admin/impresion"); revalidatePath("/admin/etiquetas"); };

export async function guardarPlantilla(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const fila = leerFormulario(f);
  if (fila.nombre.length < 2) return { error: "Poné un nombre a la plantilla" };
  if (!(fila.ancho_mm > 0) || !(fila.alto_mm > 0)) return { error: "Completá el ancho y el alto de la etiqueta" };
  const supabase = await crearCliente();
  const { error } = id ? await supabase.from("plantillas_etiqueta").update(fila).eq("id", id) : await supabase.from("plantillas_etiqueta").insert(fila);
  if (error) return { error: traducir(error) };
  refrescar();
  return { ok: id ? "Plantilla guardada" : "Plantilla creada" };
}

export async function duplicarPlantilla(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { data: p } = await supabase.from("plantillas_etiqueta").select("*").eq("id", id).maybeSingle();
  if (!p) return { error: "No se encontró la plantilla" };
  const { id: _id, creado_en: _creado, nombre, ...resto } = p;
  void _id; void _creado;
  for (let n = 1; n <= 20; n++) {
    const { error } = await supabase.from("plantillas_etiqueta").insert({ ...resto, nombre: `${nombre} (copia${n > 1 ? ` ${n}` : ""})`.slice(0, 60) });
    if (!error) { refrescar(); return { ok: "Plantilla duplicada" }; }
    if (error.code !== "23505") return { error: traducir(error) };
  }
  return { error: "No se pudo duplicar: ya hay muchas copias con ese nombre" };
}

export async function borrarPlantilla(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("plantillas_etiqueta").delete().eq("id", id);
  if (error) return { error: traducir(error) };
  refrescar();
  return { ok: "Plantilla borrada" };
}

export async function usarPlantilla(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.from("configuracion_impresion").update({ etiqueta_plantilla_id: id }).eq("unica", true).select("etiqueta_plantilla_id").maybeSingle();
  if (error) return { error: traducir(error) };
  if (!data) return { error: "No tenés permiso para cambiar la configuración de impresión" };
  refrescar();
  return { ok: "Esa plantilla es la que se propone al imprimir" };
}

// Cómo salen los comprobantes: papel, qué llevan, textos, copias y qué pasa al vender (automática, opcional o manual)
// Los comprobantes que pueden tener formato propio (los mismos que CLAVES_COMPROBANTE de lib/comprobante y que acepta la base)
const CLAVES = ["factura", "nota_credito", "interno", "presupuesto", "devolucion"];

export async function guardarComprobantes(_: Estado, f: FormData): Promise<Estado> {
  // Llega todo armado: lo general y lo propio de cada comprobante (las solapas de la pantalla)
  let c: Record<string, unknown>, porTipo: Record<string, Record<string, unknown>>;
  try { c = JSON.parse(String(f.get("config") ?? "{}")); porTipo = JSON.parse(String(f.get("por_tipo") ?? "{}")); } catch { return { error: "No se pudo leer la configuración" }; }
  const formato = String(c.formato ?? "");
  if (!esFormato(formato)) return { error: "Elegí el papel en el que se imprime" };
  const modo = String(c.modo ?? "");
  if (!["automatica", "opcional", "manual"].includes(modo)) return { error: "Elegí qué pasa al confirmar una venta" };
  const letra = String(c.letra ?? "normal");
  const copias = Math.round(Number(c.copias));
  if (!(copias >= 1 && copias <= 5)) return { error: "Las copias van de 1 a 5" };
  const txt = (x: unknown) => String(x ?? "").trim();
  const pie = txt(c.pie), leyenda = txt(c.leyenda), encabezado = txt(c.encabezado);
  if (pie.length > 200 || leyenda.length > 200) return { error: "El mensaje final y la aclaración pueden tener hasta 200 letras" };
  if (encabezado.length > 160) return { error: "La línea de arriba puede tener hasta 160 letras" };
  if (!leyenda) return { error: "Dejá una aclaración: dice que este comprobante no es una factura" };
  // Lo propio de cada comprobante: solo los campos conocidos y con valores válidos
  const limpio: Record<string, Record<string, unknown>> = {};
  for (const [clave, p] of Object.entries(porTipo)) {
    if (!CLAVES.includes(clave) || !p || typeof p !== "object") continue;
    const o: Record<string, unknown> = {};
    if (esFormato(p.formato)) o.formato = p.formato;
    if (["chica", "normal", "grande"].includes(String(p.letra))) o.letra = p.letra;
    const cp = Math.round(Number(p.copias)); if (cp >= 1 && cp <= 5) o.copias = cp;
    for (const b of ["logo", "datos_legales", "qr", "barras", "mostrar_cliente", "mostrar_vendedor", "mostrar_marca"]) if (typeof p[b] === "boolean") o[b] = p[b];
    for (const t of ["encabezado", "pie", "leyenda"]) if (typeof p[t] === "string" && (clave !== "factura" && clave !== "nota_credito" || t !== "leyenda")) {
      const v = txt(p[t]); if (v.length > 200) return { error: "Los textos de cada comprobante pueden tener hasta 200 letras" };
      o[t] = v || null;
    }
    limpio[clave] = o;
  }
  const supabase = await crearCliente();
  const { data, error } = await supabase.from("configuracion_impresion").update({
    comprobante_formato: formato, modo_impresion: modo, comprobante_letra: ["chica", "normal", "grande"].includes(letra) ? letra : "normal",
    comprobante_logo: c.logo === true, comprobante_datos_legales: c.datos_legales === true, comprobante_qr: c.qr === true, comprobante_codigo_barras: c.barras === true,
    comprobante_mostrar_cliente: c.mostrar_cliente === true, comprobante_mostrar_vendedor: c.mostrar_vendedor === true, comprobante_mostrar_marca: c.mostrar_marca === true,
    comprobante_encabezado: encabezado || null, comprobante_pie: pie || null, comprobante_leyenda: leyenda, comprobante_copias: copias, comprobante_configurado: true,
    por_tipo: limpio as unknown as NonNullable<Json>,
  }).eq("unica", true).select("unica").maybeSingle();
  if (error) return { error: error.code === "42501" ? "No tenés permiso para cambiar la configuración de impresión" : error.message };
  if (!data) return { error: "No tenés permiso para cambiar la configuración de impresión" };
  revalidatePath("/admin/impresion"); revalidatePath("/admin/ventas/nueva");
  return { ok: "Listo: así salen los comprobantes desde ahora" };
}

// El papel, el modo y las copias de una persona del equipo. Vacío = lo de la tienda; si queda todo vacío, se borra su fila.
export async function guardarImpresionPersona(usuario: string, datos: { formato: string | null; modo: string | null; copias: number | null }): Promise<Estado> {
  const formato = datos.formato && esFormato(datos.formato) ? datos.formato : null;
  const modo = datos.modo && ["automatica", "opcional", "manual"].includes(datos.modo) ? datos.modo : null;
  const copias = datos.copias && datos.copias >= 1 && datos.copias <= 5 ? Math.round(datos.copias) : null;
  const supabase = await crearCliente();
  const { error } = !formato && !modo && !copias
    ? await supabase.from("impresion_por_usuario").delete().eq("usuario_id", usuario)
    : await supabase.from("impresion_por_usuario").upsert({ usuario_id: usuario, comprobante_formato: formato, modo_impresion: modo, comprobante_copias: copias, actualizado_en: new Date().toISOString() });
  if (error) return { error: error.code === "42501" ? "No tenés permiso para cambiar la impresión del equipo" : error.message };
  revalidatePath("/admin/impresion");
  return { ok: "Guardado" };
}
