"use server";
// Gastos: cargar, borrar, los fijos por mes y la cotización del dólar. La base controla el permiso
// (gastos.gestionar) y que los automáticos (WhatsApp, IA) no se toquen a mano.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

type Estado = { error?: string; ok?: string; vez?: number };   // vez: cambia en cada carga ok, para vaciar el formulario
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const moneda = (f: FormData) => (f.get("moneda") === "USD" ? "USD" : "ARS");
const primeroDelMes = () => `${new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }).slice(0, 7)}-01`;

export async function cargarGasto(_: Estado, f: FormData): Promise<Estado> {
  const importe = Number(f.get("importe"));
  if (!(importe > 0)) return { error: "Poné el importe" };
  if (!texto(f, "descripcion")) return { error: "Contá qué es el gasto" };
  const cotizacion = Number(f.get("cotizacion"));
  const supabase = await crearCliente();
  const { error } = await supabase.from("gastos").insert({
    fecha: texto(f, "fecha") || undefined, categoria_id: Number(f.get("categoria_id")), descripcion: texto(f, "descripcion"),
    proveedor_id: Number(f.get("proveedor_id")) || null, moneda: moneda(f), importe,
    // En dólares, si no se escribe otra, la base usa la cotización del sistema
    cotizacion: moneda(f) === "USD" && cotizacion > 0 ? cotizacion : undefined,
    nota: texto(f, "nota") || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: "Gasto cargado", vez: Date.now() };
}

export async function borrarGasto(f: FormData) {
  const supabase = await crearCliente();
  await supabase.from("gastos").delete().eq("id", Number(f.get("id")));
  revalidatePath("/admin", "layout");
}

export async function cargarFijo(_: Estado, f: FormData): Promise<Estado> {
  const importe = Number(f.get("importe"));
  if (!(importe > 0)) return { error: "Poné el importe" };
  if (!texto(f, "descripcion")) return { error: "Contá qué es (Vercel, alquiler…)" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("gastos_fijos").insert({
    descripcion: texto(f, "descripcion"), categoria_id: Number(f.get("categoria_id")), moneda: moneda(f), importe,
    dia: Math.min(Math.max(Number(f.get("dia")) || 1, 1), 28),
    // Cuenta desde este mes: si su día ya pasó, el de este mes se carga en el momento
    desde: texto(f, "desde") || primeroDelMes(),
  });
  if (error) return { error: error.message };
  await supabase.rpc("generar_gastos_fijos");
  revalidatePath("/admin", "layout");
  return { ok: "Gasto fijo agregado", vez: Date.now() };
}

export async function activarFijo(f: FormData) {
  const supabase = await crearCliente();
  await supabase.from("gastos_fijos").update({ activo: f.get("activo") === "1" }).eq("id", Number(f.get("id")));
  revalidatePath("/admin", "layout");
}

export async function guardarDolar(_: Estado, f: FormData): Promise<Estado> {
  const dolar = Number(f.get("dolar"));
  if (!(dolar > 0)) return { error: "Poné la cotización" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_gastos").update({ dolar, dolar_actualizado: new Date().toISOString() }).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: "Dólar actualizado" };
}
