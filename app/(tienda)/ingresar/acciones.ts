"use server";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";

// Solo se permite volver a una ruta interna (evita redirigir a otro sitio)
const destinoSeguro = (v: FormDataEntryValue | null) => { const s = String(v ?? ""); return s.startsWith("/") && !s.startsWith("//") ? s : ""; };

export async function ingresar(_: { error: string }, f: FormData) {
  const supabase = await crearCliente();
  const { data, error } = await supabase.auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("clave")) });
  if (error) return { error: "Email o contraseña incorrectos" };
  const { data: perfil } = await supabase.from("perfiles").select("rol").eq("id", data.user.id).single();
  redirect(destinoSeguro(f.get("volver")) || (perfil?.rol === "staff" ? "/admin" : "/mi-cuenta"));
}

export async function registrarse(_: { error: string }, f: FormData) {
  const clave = String(f.get("clave"));
  if (clave.length < 8) return { error: "La contraseña tiene que tener al menos 8 caracteres" };
  const supabase = await crearCliente();
  // Al crearse el usuario, la base le arma solo su perfil de cliente y su ficha en el CRM
  const { error } = await supabase.auth.signUp({
    email: String(f.get("email")), password: clave,
    options: { data: { nombre: String(f.get("nombre")).trim(), telefono: String(f.get("telefono") ?? "").trim() || null } },
  });
  if (error) return { error: error.message.includes("registered") ? "Ya hay una cuenta con ese email. Probá ingresar." : error.message };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Te mandamos un email para confirmar la cuenta. Confirmala y después ingresá." };
  redirect(destinoSeguro(f.get("volver")) || "/mi-cuenta");
}
