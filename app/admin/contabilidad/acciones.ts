"use server";
// Contabilidad (fase A): plan de cuentas y asignaciones. La base valida el árbol, los tipos y los permisos; acá se traducen los errores.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const refrescar = () => revalidatePath("/admin/contabilidad");
const traducir = (e: { message: string; code?: string }) => (e.code === "23505" ? "Ya hay una cuenta con ese código" : e.message);

export async function guardarCuenta(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const codigo = String(f.get("codigo") ?? "").trim(), nombre = String(f.get("nombre") ?? "").trim();
  if (!/^\d+$/.test(codigo)) return { error: "El código va solo con números (por ejemplo 6101010)" };
  if (nombre.length < 2) return { error: "Poné un nombre a la cuenta" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_cuenta", {
    p_id: id as number, p_codigo: codigo, p_nombre: nombre, p_tipo: String(f.get("tipo") ?? "activo"),
    p_imputable: f.get("imputable") === "on", p_activa: id ? f.get("activa") === "on" : true,
  });
  if (error) return { error: traducir(error) };
  refrescar();
  return { ok: id ? "Cuenta guardada" : "Cuenta agregada" };
}

export async function borrarCuenta(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("borrar_cuenta", { p_id: id });
  if (error) return { error: traducir(error) };
  refrescar();
  return { ok: "Cuenta borrada" };
}

export async function importarPlan(filas: { codigo: string; nombre: string; tipo?: string }[]): Promise<Estado> {
  if (!filas.length) return { error: "La planilla no tiene filas con código y nombre" };
  if (filas.length > 2000) return { error: "Son demasiadas filas (el máximo es 2000)" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("importar_plan_cuentas", { p_filas: filas });
  if (error) return { error: traducir(error) };
  refrescar();
  return { ok: `Listo: ${data} cuentas importadas (las que ya estaban se renombraron; no se borró ninguna)` };
}

export async function asignar(que: string, id: string, campo: string, cuenta: number | null): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("asignar_cuenta", { p_que: que, p_id: id, p_campo: campo, p_cuenta: cuenta as number });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Guardado" };
}

// Empezar la contabilidad en una fecha: la base arma el asiento de apertura (stock a costo, saldos a favor y crédito con proveedores)
export async function iniciarContabilidad(_: Estado, f: FormData): Promise<Estado> {
  const fecha = String(f.get("fecha") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elegí la fecha de inicio" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("iniciar_contabilidad", { p_fecha: fecha });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "La contabilidad empezó: desde ahora cada venta, compra y gasto genera su asiento" };
}

// Un asiento a mano (por ejemplo, completar la apertura con la caja, los bancos y las deudas)
export async function asientoManual(fecha: string, concepto: string, lineas: { cuenta: number; debe: number; haber: number; detalle?: string }[]): Promise<Estado> {
  if (lineas.length < 2) return { error: "Un asiento tiene al menos dos renglones" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("registrar_asiento_manual", { p_fecha: fecha, p_concepto: concepto, p_lineas: lineas });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Asiento registrado" };
}
