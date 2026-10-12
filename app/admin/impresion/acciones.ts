"use server";
// Impresión: crear, ajustar, duplicar y elegir las plantillas de etiquetas. La base valida los rangos, el nombre único y que la grilla
// entre en la hoja; acá se traducen los errores. Solo quien edita Tablas.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

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
