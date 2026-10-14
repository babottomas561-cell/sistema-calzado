"use server";
// Cuentas de clientes: las reglas de registro y las invitaciones. Todo lo valida la base; acá se traduce.
// Al guardar, la base también le pasa a Supabase Auth la confirmación de email y las reglas de contraseña (cuentas_aplicar).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string; enlace?: string };
const texto = (f: FormData, campo: string, max = 300) => String(f.get(campo) ?? "").trim().slice(0, max);
const lista = (f: FormData, campo: string) => texto(f, campo, 2000).split(/[\s,;]+/).filter(Boolean);
const modo = (f: FormData, campo: string) => { const v = texto(f, campo, 20); return ["no", "opcional", "obligatorio"].includes(v) ? v : "no"; };

export async function guardarCuentas(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("configuracion_cuentas").update({
    registro: texto(f, "registro", 20) === "invitacion" ? "invitacion" : "abierto",
    confirmar_email: f.get("confirmar_email") === "on",
    telefono: modo(f, "telefono"), documento: modo(f, "documento"), nacimiento: modo(f, "nacimiento"), direccion: modo(f, "direccion"),
    clave_min: Math.min(64, Math.max(6, Number(f.get("clave_min")) || 8)),
    clave_exige_numero: f.get("clave_exige_numero") === "on", clave_exige_mayuscula: f.get("clave_exige_mayuscula") === "on",
    dominios_permitidos: lista(f, "dominios_permitidos"), dominios_bloqueados: lista(f, "dominios_bloqueados"),
    exigir_terminos: f.get("exigir_terminos") === "on", terminos_url: texto(f, "terminos_url", 300) || null,
    ofrecer_novedades: f.get("ofrecer_novedades") === "on",
    texto_registro: texto(f, "texto_registro", 200) || null, texto_confirmado: texto(f, "texto_confirmado", 300) || null,
  }).eq("unica", true);
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo/cuentas");
  // Lo que Supabase Auth tiene que saber (confirmación y contraseña)
  const { data, error: errAplicar } = await supabase.rpc("cuentas_aplicar");
  if (errAplicar) return { error: `Se guardó, pero ${errAplicar.message}` };
  if (!(data as { aplicado: boolean }).aplicado) {
    return { ok: "Guardado. Falta una configuración que hace quien instaló el sistema (avisale) para que la confirmación de email y las reglas de contraseña también rijan allá (Integraciones → Dominio → Conexión técnica)." };
  }
  return { ok: "Guardado y aplicado" };
}

export async function crearInvitacion(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const rol = Number(f.get("rol_id")) || null;
  const { data, error } = await supabase.rpc("crear_invitacion", { p_email: texto(f, "email", 200), p_rol: rol as number });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo/cuentas");
  return { ok: "Invitación creada: copiá el link y mandáselo (por WhatsApp o donde quieras)", enlace: data as string };
}

export async function anularInvitacion(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("anular_invitacion", { p_id: id });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo/cuentas");
  return { ok: "Invitación anulada" };
}
