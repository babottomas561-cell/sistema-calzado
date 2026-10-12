// Adonde llegan los links de los mails (confirmar la cuenta, cambiar la contraseña, confirmar un email nuevo).
// El mail trae un token_hash que se canjea acá: anda aunque el mail se abra en otro dispositivo que donde se registró.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearCliente } from "@/lib/supabase/server";

const TIPOS: EmailOtpType[] = ["signup", "recovery", "email_change", "invite", "email"];
// Solo rutas internas (evita redirigir a otro sitio)
const interna = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "");

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tipo = p.get("type") as EmailOtpType | null;
  const hash = p.get("token_hash");
  const ir = (ruta: string) => NextResponse.redirect(new URL(ruta, req.url));
  if (!hash || !tipo || !TIPOS.includes(tipo)) return ir("/ingresar?aviso=enlace");

  const supabase = await crearCliente();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: hash });
  // Link vencido o ya usado (los mails llevan un solo uso): se le explica y puede pedir otro
  if (error) return ir(tipo === "recovery" ? "/olvide-clave?aviso=enlace" : "/ingresar?aviso=enlace");

  if (tipo === "recovery" || tipo === "invite") return ir(interna(p.get("siguiente")) || "/nueva-clave");
  // Una invitación al equipo termina en el panel; un cliente, en su cuenta
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("perfiles").select("rol").eq("id", user.id).single() : { data: null };
  if (perfil?.rol === "staff") return ir("/admin");
  return ir(tipo === "signup" ? "/mi-cuenta?confirmado=1" : "/mi-cuenta");
}
