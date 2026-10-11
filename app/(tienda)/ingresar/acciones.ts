"use server";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { errorAuth } from "@/lib/errores-auth";

// Lo que vuelve al formulario: el error (o el aviso de "listo") y lo que había escrito, para no perderlo.
// "intento" cambia en cada envío: los campos lo usan de key para volver a llenarse aunque el error se repita.
export type EstadoAuth = { error?: string; ok?: string; valores?: Record<string, string> };

// Solo se permite volver a una ruta interna (evita redirigir a otro sitio)
const destinoSeguro = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : ""; };

export async function ingresar(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("clave")) });
  if (error) return { error: errorAuth(error), valores: { intento: String(Date.now()), email: String(f.get("email") ?? "") } };
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", data.user.id).single();
  redirect(destinoSeguro(f.get("volver")) || (perfil?.rol === "staff" ? "/admin" : "/mi-cuenta"));
}

export async function registrarse(_: EstadoAuth, f: FormData): Promise<EstadoAuth> {
  const valores = { intento: String(Date.now()), nombre: String(f.get("nombre") ?? "").trim(), email: String(f.get("email") ?? "").trim(), telefono: String(f.get("telefono") ?? "").trim() };
  const clave = String(f.get("clave"));
  if (clave.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres", valores };
  const supabase = await crearCliente();
  // Al crearse el usuario, la base le arma su perfil; la ficha del CRM, al confirmar el email
  const { error } = await supabase.auth.signUp({
    email: valores.email, password: clave,
    options: { data: { nombre: valores.nombre, telefono: valores.telefono || null } },
  });
  if (error) return { error: errorAuth(error), valores };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: `Listo. Te mandamos un email a ${valores.email}: tocá el link para confirmar la cuenta y después ingresá. Si no lo ves, fijate en spam.` };
  redirect(destinoSeguro(f.get("volver")) || "/mi-cuenta");
}
