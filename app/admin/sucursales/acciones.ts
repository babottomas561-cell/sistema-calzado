"use server";
// Sucursales y cajas del sistema, y su vínculo con las de Mercado Pago. Permisos y reglas, en la base.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => { const v = t(f, k); return v ? Number(v) : null; };
const listo = (ok: string): Estado => { revalidatePath("/admin/sucursales"); revalidatePath("/admin/integraciones", "layout"); return { ok }; };
type Respuesta = { ok?: boolean; error?: string } | null;
const mp = (r: Respuesta, ok: string): Estado => (r?.ok === false ? { error: r.error ?? "Mercado Pago no respondió" } : listo(ok));

export async function guardarSucursal(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_sucursal", { p_id: (num(f, "id") ?? undefined) as number, p_nombre: t(f, "nombre"), p_deposito: (num(f, "deposito") ?? undefined) as number, p_activa: f.get("activa") !== "no" });
  return error ? { error: error.message } : listo("Guardado");
}

export async function guardarCaja(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_caja", { p_id: (num(f, "id") ?? undefined) as number, p_sucursal: Number(f.get("sucursal")), p_nombre: t(f, "nombre"), p_terminal: (num(f, "terminal") ?? undefined) as number, p_activa: f.get("activa") !== "no" });
  return error ? { error: error.message } : listo("Guardado");
}

export async function vincularSucursalMp(sucursal: number, mpId: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("sucursal_vincular_mp", { p_sucursal: sucursal, p_mp: mpId });
  return error ? { error: error.message } : listo(mpId ? "Vinculada con Mercado Pago" : "Desvinculada");
}

export async function crearSucursalMp(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("sucursal_crear_en_mp", { p_sucursal: Number(f.get("sucursal")), p_calle: t(f, "calle"), p_numero: t(f, "numero"), p_ciudad: t(f, "ciudad"), p_provincia: t(f, "provincia") });
  return error ? { error: error.message } : mp(data as Respuesta, "Sucursal creada y vinculada en Mercado Pago");
}

export async function vincularCajaMp(caja: number, mpCaja: string, externo: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("caja_vincular_mp", { p_caja: caja, p_mp_caja: mpCaja, p_mp_externo: externo });
  return error ? { error: error.message } : mp(data as Respuesta, "Caja vinculada con Mercado Pago");
}

export async function crearCajaMp(caja: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("caja_crear_en_mp", { p_caja: caja });
  return error ? { error: error.message } : mp(data as Respuesta, "Caja creada y vinculada en Mercado Pago");
}

export async function desvincularCajaMp(caja: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("caja_desvincular_mp", { p_caja: caja });
  return error ? { error: error.message } : listo("Desvinculada");
}

export async function asignarCajaDispositivo(dispositivo: number, caja: number | null): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("dispositivo_asignar_caja", { p_dispositivo: dispositivo, p_caja: caja as unknown as number });
  return error ? { error: error.message } : listo("Guardado");
}
