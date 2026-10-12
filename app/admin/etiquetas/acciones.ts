"use server";
// Etiquetas: buscar y traer variantes para armar la tanda, de a una o en bloque (artículos completos, una compra, un filtro).
// Lo que se ve lo decide la base (stock.ver): sin el permiso, v_stock no devuelve filas.
import { crearCliente } from "@/lib/supabase/server";
import { leerTodo } from "@/lib/informes";
import {
  COLUMNAS_ETIQUETA, MAX_LOTE, unaPorVariante, type ArticuloEtiqueta, type CompraEtiqueta, type FilaConCantidad, type FilaEtiqueta, type FiltroLote,
} from "@/lib/etiquetas";

const limpio = (q: string) => q.replace(/[%,()]/g, "").trim();
// Cuántas etiquetas se proponen de cada una: las unidades que hay (lo agotado queda en 0 y no se imprime hasta que se ponga a mano)
const conStock = (f: FilaEtiqueta): FilaConCantidad => ({ ...f, cantidad: Math.max(f.stock, 0) });

export async function buscarVariantesEtiqueta(q: string): Promise<FilaEtiqueta[]> {
  const t = limpio(q);
  if (t.length < 2) return [];
  const supabase = await crearCliente();
  const { data } = await supabase.from("v_stock").select(COLUMNAS_ETIQUETA)
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,sku.ilike.${t}%,codigo_barras.ilike.${t}%`).order("nombre").order("talle_orden").limit(80);
  return unaPorVariante((data ?? []) as Record<string, unknown>[]).slice(0, 40);
}

// Artículos (no variantes) para sumar completos: con cuántas variantes tienen y cuántas ya traen código
export async function buscarArticulosEtiqueta(q: string): Promise<ArticuloEtiqueta[]> {
  const t = limpio(q);
  if (t.length < 2) return [];
  const supabase = await crearCliente();
  const { data } = await supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, codigo_barras, stock")
    .or(`nombre.ilike.%${t}%,marca.ilike.%${t}%,codigo.ilike.%${t}%`).order("nombre").limit(600);
  const por = new Map<number, ArticuloEtiqueta & { vistas: Set<number> }>();
  for (const f of data ?? []) {
    const a = por.get(f.producto_id ?? 0) ?? { producto_id: f.producto_id ?? 0, nombre: f.nombre ?? "", marca: f.marca ?? null, variantes: 0, conCodigo: 0, stock: 0, vistas: new Set<number>() };
    if (!a.vistas.has(f.variante_id ?? 0)) { a.vistas.add(f.variante_id ?? 0); a.variantes++; if (f.codigo_barras) a.conCodigo++; }
    a.stock += f.stock ?? 0;
    por.set(a.producto_id, a);
  }
  return [...por.values()].slice(0, 25).map((a) => ({ producto_id: a.producto_id, nombre: a.nombre, marca: a.marca, variantes: a.variantes, conCodigo: a.conCodigo, stock: a.stock }));
}

// Todos los talles y colores de esos artículos
export async function variantesDeArticulos(ids: number[]): Promise<{ filas: FilaConCantidad[]; truncado: boolean }> {
  const lista = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 800);
  if (!lista.length) return { filas: [], truncado: false };
  const supabase = await crearCliente();
  const filas = await leerTodo((a, b) => supabase.from("v_stock").select(COLUMNAS_ETIQUETA).in("producto_id", lista).order("nombre").order("talle_orden").range(a, b));
  const todas = unaPorVariante(filas as Record<string, unknown>[]);
  return { filas: todas.slice(0, MAX_LOTE).map(conStock), truncado: todas.length > MAX_LOTE };
}

// Las compras recientes, para etiquetar lo que entró
export async function comprasParaEtiquetar(): Promise<CompraEtiqueta[]> {
  const supabase = await crearCliente();
  const { data } = await supabase.from("compras").select("id, comprobante, fecha, proveedores(nombre), compra_items(cantidad)").order("fecha", { ascending: false }).limit(30);
  return (data ?? []).map((c) => ({
    id: c.id, comprobante: c.comprobante ?? "", fecha: c.fecha, proveedor: (c.proveedores as unknown as { nombre: string } | null)?.nombre ?? null,
    unidades: (c.compra_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0),
  }));
}

export async function variantesDeCompra(id: number): Promise<{ filas: FilaConCantidad[]; comprobante: string }> {
  const supabase = await crearCliente();
  const [{ data: c }, { data: items }] = await Promise.all([
    supabase.from("compras").select("comprobante").eq("id", id).maybeSingle(),
    supabase.from("compra_items").select("variante_id, cantidad").eq("compra_id", id),
  ]);
  const cantidades = new Map<number, number>();
  for (const i of items ?? []) cantidades.set(i.variante_id, (cantidades.get(i.variante_id) ?? 0) + i.cantidad);
  if (!cantidades.size) return { filas: [], comprobante: c?.comprobante ?? "" };
  const { data } = await supabase.from("v_stock").select(COLUMNAS_ETIQUETA).in("variante_id", [...cantidades.keys()]).order("nombre").order("talle_orden");
  return { filas: unaPorVariante((data ?? []) as Record<string, unknown>[]).map((f) => ({ ...f, cantidad: cantidades.get(f.variante_id) ?? 0 })), comprobante: c?.comprobante ?? "" };
}

// Todo lo de una marca, un rubro, un género o una temporada (combinables)
export async function variantesPorFiltro(f: FiltroLote): Promise<{ filas: FilaConCantidad[]; truncado: boolean }> {
  const supabase = await crearCliente();
  const todas = unaPorVariante((await leerTodo((a, b) => {
    let c = supabase.from("v_stock").select(COLUMNAS_ETIQUETA).order("nombre").order("talle_orden");
    if (f.marca) c = c.eq("marca", f.marca);
    if (f.categoria) c = c.eq("categoria", f.categoria);
    if (f.genero) c = c.eq("genero", f.genero);
    if (f.temporada) c = c.eq("temporada", f.temporada);
    if (f.soloConStock) c = c.gt("stock", 0);
    return c.range(a, b);
  })) as Record<string, unknown>[]);
  return { filas: todas.slice(0, MAX_LOTE).map(conStock), truncado: todas.length > MAX_LOTE };
}
