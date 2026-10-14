"use server";
// Mails al cliente: guardar una plantilla, restaurarla, ver cómo queda y mandarse una prueba. Las reglas (variables válidas, sin HTML, las de cuenta no se apagan)
// las pone la base. Si se cambia un mail de cuenta, se le pasa también a Supabase (es él quien manda esos).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };
const t = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const CUENTA = ["confirmacion", "recuperar", "cambio_email", "invitacion"];

async function aplicarEnSupabase(supabase: Awaited<ReturnType<typeof crearCliente>>, clave: string): Promise<string> {
  if (!CUENTA.includes(clave)) return "";
  const { data, error } = await supabase.rpc("cuentas_aplicar");
  if (error) return ` Se guardó, pero no se pudo pasar a Supabase: ${error.message}`;
  return (data as { aplicado?: boolean })?.aplicado ? " Ya lo usa Supabase." : " Todavía falta una configuración del instalador para que Supabase lo use.";
}

export async function guardarPlantilla(_: Estado, f: FormData): Promise<Estado> {
  const clave = t(f, "clave");
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_plantilla_mail", {
    p_clave: clave, p_asunto: t(f, "asunto"), p_titulo: t(f, "titulo"), p_texto: t(f, "texto"), p_boton: t(f, "boton"), p_pie: t(f, "pie"),
    p_activa: f.get("activa") === "on", p_con_pdf: f.has("con_pdf") ? f.get("con_pdf") === "on" : undefined,
  });
  if (error) return { error: error.message };
  const extra = await aplicarEnSupabase(supabase, clave);
  revalidatePath("/admin/tienda/mails");
  return { ok: `Guardado.${extra}` };
}

export async function restaurarPlantilla(clave: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("restaurar_plantilla_mail", { p_clave: clave });
  if (error) return { error: error.message };
  const extra = await aplicarEnSupabase(supabase, clave);
  revalidatePath("/admin/tienda/mails");
  return { ok: `Volvió al texto original.${extra}` };
}

export async function vistaPrevia(clave: string, asunto: string, titulo: string, texto: string, boton: string, pie: string): Promise<{ asunto?: string; html?: string; error?: string }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("vista_previa_mail", { p_clave: clave, p_asunto: asunto, p_titulo: titulo, p_texto: texto, p_boton: boton, p_pie: pie });
  if (error) return { error: error.message };
  return data as { asunto: string; html: string };
}

export async function mandarPrueba(clave: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("probar_plantilla_mail", { p_clave: clave });
  if (error) return { error: error.message };
  const r = data as { ok: boolean; error?: string; para?: string };
  return r.ok ? { ok: `Te lo mandamos a ${r.para}. Revisá también spam.` } : { error: r.error ?? "No se pudo mandar" };
}
