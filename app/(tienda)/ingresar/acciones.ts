"use server";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { errorAuth } from "@/lib/errores-auth";
import { errorClave, leerConfigCuentas } from "@/lib/cuentas";

// Lo que vuelve al formulario: el error (o el aviso de "listo") y lo que había escrito, para no perderlo.
// "intento" cambia en cada envío: los campos lo usan de key para volver a llenarse aunque el error se repita.
export type EstadoAuth = { error?: string; ok?: string; valores?: Record<string, string> };

// Solo se permite volver a una ruta interna (evita redirigir a otro sitio)
const destinoSeguro = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : ""; };

export async function ingresar(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("clave")) });
  if (error) return { error: errorAuth(error), valores: { intento: String(Date.now()), email: String(f.get("email") ?? ""), ...(error.code === "email_not_confirmed" ? { sinConfirmar: "1" } : {}) } };
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", data.user.id).single();
  redirect(destinoSeguro(f.get("volver")) || (perfil?.rol === "staff" ? "/admin" : "/mi-cuenta"));
}

// Los datos del formulario de registro que viajan con la cuenta (la base los usa para armar el perfil y la ficha)
const CAMPOS = ["nombre", "telefono", "documento", "nacimiento", "direccion"] as const;

export async function registrarse(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const supabase = await crearCliente();
  const config = await leerConfigCuentas(supabase);
  const meta: Record<string, string> = {};
  for (const c of CAMPOS) { const v = String(f.get(c) ?? "").trim(); if (v) meta[c] = v; }
  if (f.get("terminos")) meta.terminos = "true";
  if (f.get("novedades")) meta.novedades = "true";
  const invitacion = String(f.get("invitacion") ?? "");
  if (invitacion) meta.invitacion = invitacion;
  const email = String(f.get("email") ?? "").trim();
  const valores = { intento: String(Date.now()), email, ...meta };
  const clave = String(f.get("clave") ?? "");

  if (!meta.nombre) return { error: "Escribí tu nombre y apellido", valores };
  const errClave = errorClave(config, clave);
  if (errClave) return { error: errClave, valores };
  // Las reglas del local (dominios, datos obligatorios, términos) las dice la base: acá se pregunta antes de crear nada
  const { data: motivo } = await supabase.rpc("validar_registro", { p_email: email, p_meta: meta });
  if (motivo) return { error: motivo, valores };

  // Al crearse el usuario, la base le arma su perfil; la ficha del CRM, al confirmar el email
  const { data, error } = await supabase.auth.signUp({ email, password: clave, options: { data: meta } });
  if (error) return { error: errorAuth(error), valores };
  // Con la confirmación activa, un email que ya tiene cuenta vuelve sin identidades (y no manda ningún mail)
  if (data.user && data.user.identities?.length === 0) {
    return { error: "Ya hay una cuenta con ese email. Probá ingresar, o cambiá la contraseña si no la recordás.", valores };
  }
  if (!data.session) return { ok: config.texto_confirmado ?? "Te mandamos un email: tocá el link para confirmar la cuenta y después ingresá.", valores };
  redirect(destinoSeguro(f.get("volver")) || "/mi-cuenta");
}

// Reenviar el mail de confirmación (si no llegó o el link venció)
export async function reenviarConfirmacion(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const email = String(f.get("email") ?? "").trim();
  if (!email) return { error: "Falta el email" };
  const supabase = await crearCliente();
  const { error } = await supabase.auth.resend({ type: "signup", email });
  if (error) return { error: errorAuth(error) };
  return { ok: `Te lo mandamos de nuevo a ${email}. Puede tardar un minuto; fijate también en spam.` };
}

// «Olvidé mi contraseña»: siempre la misma respuesta, exista o no la cuenta (no se revela quién tiene cuenta)
export async function pedirRecuperacion(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const email = String(f.get("email") ?? "").trim();
  if (!email) return { error: "Escribí tu email" };
  const supabase = await crearCliente();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit")) return { error: errorAuth(error), valores: { email } };
  return { ok: `Si hay una cuenta con ${email}, te mandamos un email para elegir una contraseña nueva. Fijate también en spam.`, valores: { email } };
}

// Elegir la contraseña nueva (se llega con el link del mail, que ya dejó la sesión abierta)
export async function cambiarClave(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const supabase = await crearCliente();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "El link venció. Pedí uno nuevo desde «Olvidé mi contraseña»." };
  const clave = String(f.get("clave") ?? "");
  if (clave !== String(f.get("repetir") ?? "")) return { error: "Las dos contraseñas no coinciden" };
  const err = errorClave(await leerConfigCuentas(supabase), clave);
  if (err) return { error: err };
  const { error } = await supabase.auth.updateUser({ password: clave });
  if (error) return { error: errorAuth(error) };
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", user.id).single();
  redirect(perfil?.rol === "staff" ? "/admin" : "/mi-cuenta?clave=1");
}
