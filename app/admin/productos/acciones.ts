"use server";
// Acciones de productos: alta, edición, variantes y ajuste de stock.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

// Los <input type="number"> mandan el decimal con punto ("52000.5"), sin separador de miles
const num = (v: FormDataEntryValue | null) => Number(v ?? 0) || 0;
const idONulo = (v: FormDataEntryValue | null) => (v ? Number(v) : null);
const ids = (f: FormData, campo: string) => f.getAll(campo).map(Number).filter(Boolean);

function datosProducto(f: FormData) {
  return {
    // Código de artículo: si queda vacío, la base lo genera (rubro + número: ZAP-0007)
    codigo: String(f.get("codigo") ?? "").trim().toUpperCase(),
    nombre: String(f.get("nombre") ?? "").trim(),
    // Se eligen de listas: llegan los id, nunca texto libre
    marca_id: idONulo(f.get("marca_id")),
    categoria_id: idONulo(f.get("categoria_id")),
    subcategoria_id: idONulo(f.get("subcategoria_id")),
    genero: String(f.get("genero") ?? "") || null,
    descripcion: String(f.get("descripcion") ?? "").trim() || null,
    // imagen_url no va acá: la mantiene la base (es la foto principal de producto_imagenes)
    precio_compra: num(f.get("precio_compra")),
    // Si el campo no vino (bloqueado por permisos), no se toca el precio de venta
    ...(f.has("precio_venta") ? { precio_venta: num(f.get("precio_venta")) } : {}),
    publicado_web: f.get("publicado_web") === "on",
  };
}

// Una variante por cada combinación talle × color (las que ya existen no se duplican)
async function crearVariantes(productoId: number, talleIds: number[], colorIds: number[]) {
  const supabase = await crearCliente();
  const filas = talleIds.flatMap((talle_id) => colorIds.map((color_id) => ({ producto_id: productoId, talle_id, color_id })));
  const { error } = await supabase.from("variantes").upsert(filas, { onConflict: "producto_id,talle_id,color_id", ignoreDuplicates: true });
  return error;
}

export async function crearProducto(_: Estado, f: FormData): Promise<Estado> {
  const producto = datosProducto(f);
  if (!producto.nombre) return { error: "Falta el nombre" };
  if (!producto.categoria_id) return { error: "Elegí el rubro" };
  const talles = ids(f, "talle_ids"), colores = ids(f, "color_ids");
  if (!talles.length || !colores.length) return { error: "Tildá al menos un talle y un color" };

  const supabase = await crearCliente();
  const { data, error } = await supabase.from("productos").insert(producto).select("id").single();
  if (error) return { error: error.message.includes("duplicate") ? "Ya existe un artículo con ese código" : error.message };
  const errVar = await crearVariantes(data.id, talles, colores);
  if (errVar) return { error: errVar.message };
  revalidatePath("/admin/productos");
  revalidatePath("/");
  redirect(`/admin/productos/${data.id}`);
}

export async function actualizarProducto(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id"));
  const producto = { ...datosProducto(f), activo: f.get("activo") === "on" };
  if (!producto.nombre) return { error: "Falta el nombre" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("productos").update(producto).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${id}`);
  return { ok: "Guardado" };
}

export async function agregarVariantes(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id"));
  const talles = ids(f, "talle_ids"), colores = ids(f, "color_ids");
  if (!talles.length || !colores.length) return { error: "Tildá al menos un talle y un color" };
  const error = await crearVariantes(id, talles, colores);
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${id}`);
  return { ok: `Listo: ${talles.length * colores.length} combinaciones (las que ya existían no se duplican)` };
}

export async function ajustarStock(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("ajustar_stock", {
    p_variante: Number(f.get("variante_id")),
    p_stock_nuevo: Number(f.get("stock_nuevo")),
    p_motivo: String(f.get("motivo") ?? ""),
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${f.get("producto_id")}`);
  return { ok: "Stock ajustado" };
}

// ── Proveedores del artículo (lista de precios de compra) ─────────────
// Alta o edición del precio de un proveedor para este artículo; también "marcar principal" y "quitar".
export async function guardarProveedor(_: Estado, f: FormData): Promise<Estado> {
  const productoId = Number(f.get("producto_id"));
  const id = Number(f.get("id")) || null;
  const supabase = await crearCliente();
  let error;
  if (f.get("_accion") === "quitar" && id) {
    ({ error } = await supabase.from("producto_proveedores").delete().eq("id", id));
  } else {
    const fila = {
      codigo_proveedor: String(f.get("codigo_proveedor") ?? "").trim() || null,
      precio_lista: num(f.get("precio_lista")),
      bonificacion_pct: num(f.get("bonificacion_pct")),
      principal: f.get("principal") === "on",
      actualizado_en: new Date().toISOString(),
    };
    if (id) ({ error } = await supabase.from("producto_proveedores").update(fila).eq("id", id));
    else {
      const proveedorId = Number(f.get("proveedor_id"));
      if (!proveedorId) return { error: "Elegí el proveedor" };
      ({ error } = await supabase.from("producto_proveedores").insert({ ...fila, producto_id: productoId, proveedor_id: proveedorId }));
    }
  }
  if (error) return { error: error.code === "23505" ? "Ese proveedor ya está cargado para este artículo" : error.code === "23514" ? "Revisá el precio y la bonificación (0 a 99 %)" : error.message };
  revalidatePath(`/admin/productos/${productoId}`);
  return { ok: f.get("_accion") === "quitar" ? "Quitado" : "Guardado" };
}

// Alta rápida desde la carga de una factura de compra: crea el artículo con sus variantes
// y devuelve el id (sin redirigir), para seguir cargando la factura.
export async function crearProductoRapido(f: FormData): Promise<Estado & { id?: number }> {
  const producto = datosProducto(f);
  if (!producto.nombre) return { error: "Falta el modelo" };
  if (!producto.categoria_id) return { error: "Elegí el rubro" };
  const talles = ids(f, "talle_ids"), colores = ids(f, "color_ids");
  if (!talles.length || !colores.length) return { error: "Tildá al menos un talle y un color" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.from("productos").insert(producto).select("id").single();
  if (error) return { error: error.message.includes("duplicate") ? "Ya existe un artículo con ese código" : error.message };
  const errVar = await crearVariantes(data.id, talles, colores);
  if (errVar) return { error: errVar.message };
  revalidatePath("/admin/compras/nueva");
  return { ok: "Artículo creado", id: data.id };
}

// ── Fotos del artículo (galería) ──────────────────────────────────────
// El archivo lo sube el navegador directo a Storage (ya achicado); acá se registra en la galería.
// Qué foto es la principal y qué pasa al borrarla lo resuelve la base (triggers de producto_imagenes).
const BUCKET = "productos";

export async function registrarImagenes(productoId: number, fotos: { url: string; ruta: string | null }[]): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("producto_imagenes").insert(fotos.map((f) => ({ producto_id: productoId, ...f })));
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${productoId}`);
  revalidatePath("/");
  return { ok: fotos.length === 1 ? "Foto agregada" : `${fotos.length} fotos agregadas` };
}

export async function marcarPrincipal(productoId: number, id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("producto_imagenes").update({ principal: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${productoId}`);
  revalidatePath("/");
  return { ok: "Foto principal cambiada" };
}

// Corre una foto un lugar a la izquierda (-1) o a la derecha (+1) en la galería
export async function moverImagen(productoId: number, id: number, paso: -1 | 1): Promise<Estado> {
  const supabase = await crearCliente();
  const { data } = await supabase.from("producto_imagenes").select("id").eq("producto_id", productoId).order("orden").order("id");
  const lista = (data ?? []).map((i) => i.id);
  const desde = lista.indexOf(id), hasta = desde + paso;
  if (desde < 0 || hasta < 0 || hasta >= lista.length) return {};
  [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];
  // Se renumera toda la galería (1, 2, 3…) para que el orden quede siempre prolijo
  const cambios = await Promise.all(lista.map((imgId, i) => supabase.from("producto_imagenes").update({ orden: i + 1 }).eq("id", imgId)));
  const error = cambios.find((c) => c.error)?.error;
  if (error) return { error: error.message };
  revalidatePath(`/admin/productos/${productoId}`);
  revalidatePath("/");
  return {};
}

export async function borrarImagen(productoId: number, id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.from("producto_imagenes").delete().eq("id", id).select("ruta").single();
  if (error) return { error: error.message };
  // Si la foto estaba en nuestro Storage, se borra también el archivo (un link externo no se toca)
  if (data.ruta) await supabase.storage.from(BUCKET).remove([data.ruta]);
  revalidatePath(`/admin/productos/${productoId}`);
  revalidatePath("/");
  return { ok: "Foto borrada" };
}
