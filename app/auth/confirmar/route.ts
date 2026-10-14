// Adonde llegan los links de los mails (confirmar la cuenta, cambiar la contraseña, confirmar un email nuevo).
// El mail trae un token_hash que se canjea acá: anda aunque el mail se abra en otro dispositivo que donde se registró.
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { crearCliente } from "@/lib/supabase/server";

const TIPOS: EmailOtpType[] = ["signup", "recovery", "email_change", "invite", "email"];
// Solo rutas internas (evita redirigir a otro sitio)
const interna = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "");

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
const TEXTOS: Record<string, [string, string]> = {
  signup: ["Confirmá tu email", "Tocá el botón para confirmar tu cuenta."],
  recovery: ["Cambiá tu contraseña", "Tocá el botón para elegir una contraseña nueva."],
  email_change: ["Confirmá tu nuevo email", "Tocá el botón para confirmar el cambio."],
  invite: ["Aceptá la invitación", "Tocá el botón para crear tu acceso."],
  email: ["Confirmá tu email", "Tocá el botón para continuar."],
};

// Abrir el link NO gasta el token: los programas de correo y los antivirus abren los links antes que la persona y lo dejaban vencido.
// Acá solo se muestra un botón; el token se canjea cuando la persona lo toca (POST).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const tipo = p.get("type") as EmailOtpType | null;
  const hash = p.get("token_hash");
  if (!hash || !tipo || !TIPOS.includes(tipo)) return NextResponse.redirect(new URL("/ingresar?aviso=enlace", req.url));
  const [titulo, texto] = TEXTOS[tipo] ?? TEXTOS.email;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${esc(titulo)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;color:#18181b}main{background:#fff;border-radius:16px;padding:32px 24px;max-width:380px;width:calc(100% - 32px);box-shadow:0 1px 4px rgba(0,0,0,.08);text-align:center}h1{font-size:22px;margin:0 0 8px}p{margin:0 0 24px;color:#52525b;line-height:1.5}button{width:100%;height:48px;border:0;border-radius:12px;background:#1d4ed8;color:#fff;font-size:16px;font-weight:600;cursor:pointer}</style></head>
<body><main><h1>${esc(titulo)}</h1><p>${esc(texto)}</p><form method="post"><input type="hidden" name="token_hash" value="${esc(hash)}"><input type="hidden" name="type" value="${esc(tipo)}"><input type="hidden" name="siguiente" value="${esc(p.get("siguiente") ?? "")}"><button type="submit">Continuar</button></form></main></body></html>`;
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export async function POST(req: NextRequest) {
  const f = await req.formData();
  const tipo = String(f.get("type") ?? "") as EmailOtpType;
  const hash = String(f.get("token_hash") ?? "");
  const siguiente = String(f.get("siguiente") ?? "");
  // 303: después de un POST, el navegador sigue con un GET
  const ir = (ruta: string) => NextResponse.redirect(new URL(ruta, req.url), 303);
  if (!hash || !tipo || !TIPOS.includes(tipo)) return ir("/ingresar?aviso=enlace");

  const supabase = await crearCliente();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: hash });
  // Link vencido o ya usado (los mails llevan un solo uso): se le explica y puede pedir otro
  if (error) return ir(tipo === "recovery" ? "/olvide-clave?aviso=enlace" : "/ingresar?aviso=enlace");

  if (tipo === "recovery" || tipo === "invite") return ir(interna(siguiente) || "/nueva-clave");
  // Una invitación al equipo termina en el panel; un cliente, en su cuenta
  const { data: { user } } = await supabase.auth.getUser();
  const { data: perfil } = user ? await supabase.from("perfiles").select("rol").eq("id", user.id).single() : { data: null };
  if (perfil?.rol === "staff") return ir("/admin");
  return ir(tipo === "signup" ? "/mi-cuenta?confirmado=1" : "/mi-cuenta");
}
