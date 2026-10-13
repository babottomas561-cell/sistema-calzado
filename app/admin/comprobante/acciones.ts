"use server";
// Mandar un comprobante: por mail (sale desde la base por Resend), por WhatsApp (se abre desde el panel; acá solo queda anotado) o
// copiando el link. Los permisos los controla la base (comprobante_de / enviar_comprobante_mail).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { esTipo } from "@/lib/comprobante";

export type Estado = { error?: string; ok?: string };
type Enlace = { token?: string; ruta?: string; url?: string | null };

const refrescar = (tipo: string, id: number) => revalidatePath(`/admin/comprobante/${tipo}/${id}`);

export async function enviarPorMail(_: Estado, f: FormData): Promise<Estado> {
  const tipo = String(f.get("tipo") ?? ""), id = Number(f.get("id")), email = String(f.get("email") ?? "").trim();
  if (!esTipo(tipo) || !id) return { error: "No se encontró el comprobante" };
  if (!email) return { error: "Escribí el email del cliente" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("enviar_comprobante_mail", { p_tipo: tipo, p_id: id, p_email: email });
  if (error) return { error: error.message };
  refrescar(tipo, id);
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) return { error: `Resend no lo aceptó: ${r?.error ?? "sin explicación"}` };
  return { ok: `Comprobante enviado a ${email.toLowerCase()}` };
}

// Anota que se abrió WhatsApp o se copió el link (no se puede saber si después lo mandó)
export async function registrarEnvio(tipo: string, id: number, canal: "whatsapp" | "enlace", destino: string | null): Promise<void> {
  if (!esTipo(tipo) || !id) return;
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("registrar_envio_comprobante", { p_tipo: tipo, p_id: id, p_canal: canal, p_destino: destino ?? undefined });
  if (!error) refrescar(tipo, id);
}

// Invalida el link anterior (por si se mandó a quien no era) y crea uno nuevo
export async function renovarEnlace(tipo: string, id: number): Promise<{ error?: string; enlace?: Enlace }> {
  if (!esTipo(tipo) || !id) return { error: "No se encontró el comprobante" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("renovar_enlace_comprobante", { p_tipo: tipo, p_id: id });
  if (error) return { error: error.message };
  refrescar(tipo, id);
  return { enlace: data as Enlace };
}
