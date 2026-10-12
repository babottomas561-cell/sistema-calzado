"use server";
// Promociones: alta, edición, pausa y baja. Las reglas (qué es válido, cómo se aplica) están en la base.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

const ids = (f: FormData, campo: string) => f.getAll(campo).map(Number).filter(Boolean);
const numONulo = (v: FormDataEntryValue | null) => (v === null || String(v).trim() === "" ? null : Number(v));
// Fechas del formulario (día argentino): "desde" a las 0 h; "hasta" incluye ese día entero
const desde = (d: string) => (d ? `${d}T00:00:00-03:00` : null);
const hasta = (d: string) => { if (!d) return null; const x = new Date(`${d}T00:00:00-03:00`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString(); };

function refrescar() { revalidatePath("/admin/promociones"); revalidatePath("/", "layout"); }

export async function guardarPromocion(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const id = Number(f.get("id")) || null;
  const tipo = String(f.get("tipo"));
  const fila = {
    nombre: String(f.get("nombre") ?? "").trim(), tipo,
    lleva: tipo === "nxm" ? numONulo(f.get("lleva")) : null, paga: tipo === "nxm" ? numONulo(f.get("paga")) : null,
    descuento_pct: tipo === "segunda_unidad" || tipo === "porcentaje" ? numONulo(f.get("descuento_pct")) : null,
    precio_fijo: tipo === "precio_fijo" ? numONulo(f.get("precio_fijo")) : null,
    desde: desde(String(f.get("desde") ?? "")), hasta: hasta(String(f.get("hasta") ?? "")),
    en_tienda: f.get("en_tienda") === "on", en_mostrador: f.get("en_mostrador") === "on",
    acumula_medio_pago: f.get("acumula_medio_pago") === "on", mezcla: f.get("mezcla") === "on",
    prioridad: Number(f.get("prioridad") ?? 0) || 0,
  };
  if (!fila.nombre) return { error: "Poné un nombre (es lo que ve el cliente)" };
  if (!fila.en_tienda && !fila.en_mostrador) return { error: "Elegí al menos dónde vale: tienda o local" };
  const alcances = [
    ...ids(f, "marca_ids").map((x) => ({ marca_id: x, excluir: false })),
    ...ids(f, "categoria_ids").map((x) => ({ categoria_id: x, excluir: false })),
    ...ids(f, "subcategoria_ids").map((x) => ({ subcategoria_id: x, excluir: false })),
    ...ids(f, "producto_ids").map((x) => ({ producto_id: x, excluir: false })),
    ...ids(f, "excluir_ids").map((x) => ({ producto_id: x, excluir: true })),
  ];
  if (!alcances.some((a) => !a.excluir)) return { error: "Elegí a qué aplica: alguna marca, rubro, subrubro o artículo" };

  const { data, error } = id
    ? await supabase.from("promociones").update(fila).eq("id", id).select("id").single()
    : await supabase.from("promociones").insert(fila).select("id").single();
  if (error) return { error: error.code === "23514" ? "Revisá los datos: en 'lleva N paga M', M tiene que ser menor que N; el % entre 1 y 100; la fecha 'hasta' después de 'desde'" : error.message };
  // El alcance se reemplaza entero
  await supabase.from("promocion_alcances").delete().eq("promocion_id", data.id);
  const { error: e2 } = await supabase.from("promocion_alcances").insert(alcances.map((a) => ({ ...a, promocion_id: data.id })));
  if (e2) return { error: e2.message };
  refrescar();
  return { ok: id ? "Promoción guardada" : "Promoción creada" };
}

export async function pausarPromocion(id: number, activa: boolean): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("promociones").update({ activa }).eq("id", id);
  if (error) return { error: error.message };
  refrescar();
  return { ok: activa ? "Promoción activada" : "Promoción pausada" };
}

export async function borrarPromocion(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("promociones").delete().eq("id", id);
  if (error) return { error: error.code === "23503" ? "Ya se usó en ventas o pedidos: no se puede borrar (pausala)" : error.message };
  refrescar();
  return { ok: "Promoción borrada" };
}
