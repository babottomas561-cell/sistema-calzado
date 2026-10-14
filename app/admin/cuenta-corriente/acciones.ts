"use server";
// Cuenta corriente: habilitar clientes, cobrar deudas y ajustar. Todo lo decide la base (permisos, tope, saldo, módulo encendido).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { leerMonto } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function habilitarCuenta(_: Estado, f: FormData): Promise<Estado> {
  const tope = leerMonto(texto(f, "tope")) ?? 0;
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("cc_habilitar", { p_cliente: Number(f.get("cliente")), p_habilitada: f.get("habilitada") === "on", p_tope: tope });
  if (error) return { error: error.message };
  revalidatePath("/admin/cuenta-corriente", "layout");
  return { ok: "Guardado" };
}

export async function cobrarDeuda(_: Estado, f: FormData): Promise<Estado> {
  const monto = leerMonto(texto(f, "monto"));
  if (!monto || monto <= 0) return { error: "Poné cuánto paga" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cc_cobrar", { p_cliente: Number(f.get("cliente")), p_monto: monto, p_medio: Number(f.get("medio")),
    p_referencia: texto(f, "referencia") || undefined, p_nota: texto(f, "nota") || undefined });
  if (error) return { error: error.message };
  revalidatePath("/admin/cuenta-corriente", "layout");
  redirect(`/admin/cuenta-corriente/recibo/${data}`);   // el recibo se imprime o se manda
}

export async function ajustarCuenta(_: Estado, f: FormData): Promise<Estado> {
  const monto = leerMonto(texto(f, "monto"));
  if (!monto) return { error: "Poné el importe del ajuste (con − si baja la deuda)" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("cc_ajustar", { p_cliente: Number(f.get("cliente")), p_monto: monto, p_nota: texto(f, "nota") });
  if (error) return { error: error.message };
  revalidatePath("/admin/cuenta-corriente", "layout");
  return { ok: "Ajuste registrado" };
}
