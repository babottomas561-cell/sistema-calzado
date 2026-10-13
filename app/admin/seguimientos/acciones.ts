"use server";
// Seguimientos: crear uno nuevo (qué hay que hacer con un cliente y cuándo), posponerlo o darlo por hecho. Son interacciones con «próxima acción».
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const hoyMas = (dias: number) => { const d = new Date(Date.now() - 3 * 3600e3); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

export async function crearSeguimiento(_: Estado, f: FormData): Promise<Estado> {
  const cliente = Number(f.get("cliente_id"));
  const accion = String(f.get("accion") ?? "").trim();
  const cuando = String(f.get("cuando") ?? "");
  if (!cliente) return { error: "Elegí el cliente" };
  if (!accion) return { error: "Escribí qué hay que hacer" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cuando)) return { error: "Elegí cuándo" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("interacciones").insert({
    cliente_id: cliente, tipo: "Seguimiento", canal: String(f.get("canal") ?? "") || null,
    detalle: String(f.get("nota") ?? "").trim() || accion, proxima_accion: accion, proxima_fecha: cuando, hecha: false,
  });
  if (error) return { error: error.code === "42501" ? "No tenés permiso para cargar seguimientos" : error.message };
  revalidatePath("/admin/seguimientos"); revalidatePath(`/admin/clientes/${cliente}`);
  return { ok: "Listo: queda en la agenda" };
}

export async function posponer(id: number, dias: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("interacciones").update({ proxima_fecha: hoyMas(dias) }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/seguimientos");
  return { ok: "Pospuesto" };
}

export async function hecho(id: number, cliente: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("interacciones").update({ hecha: true }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/seguimientos"); revalidatePath(`/admin/clientes/${cliente}`);
  return { ok: "Hecho" };
}
