// Manda UN mail por el servidor SMTP del local (Gmail u otro). La base no sabe hablar SMTP, así que le pide a esta ruta que lo mande.
// No guarda nada, no registra el contenido y no sabe ningún secreto: cada pedido viene firmado por la base (HMAC) y antes de mandar se
// le pregunta a la base si la firma es buena (`correo_verificar`). Sin firma válida, nadie puede usar esta ruta para mandar mails.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LIMITE = 400_000;   // un comprobante pesa unos pocos KB
const PUERTOS = [465, 587, 2465, 2525, 2587];
const respuesta = (ok: boolean, error?: string, status = 200) => Response.json(ok ? { ok } : { ok, error }, { status });
const texto = (x: unknown, max: number) => (typeof x === "string" && x.length > 0 && x.length <= max ? x : null);
const email = (x: unknown) => { const t = texto(x, 200); return t && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? t : null; };

// Los errores de nodemailer vienen en inglés y técnicos: se traducen los que le pasan a cualquiera
function explicar(e: unknown): string {
  const codigo = (e as { code?: string })?.code, respuestaServidor = String((e as { response?: string })?.response ?? "");
  if (codigo === "EAUTH") return "El servidor de correo rechazó el usuario o la contraseña. Con Gmail hace falta una «contraseña de aplicación», no la de siempre.";
  if (codigo === "ETIMEDOUT" || codigo === "ESOCKET" || codigo === "ECONNECTION" || codigo === "ECONNREFUSED" || codigo === "ENOTFOUND" || codigo === "EDNS")
    return "No se pudo conectar con el servidor de correo: revisá el servidor y el puerto.";
  if (codigo === "EENVELOPE") return "El servidor de correo no aceptó esa dirección.";
  return (respuestaServidor || (e instanceof Error ? e.message : "No se pudo mandar el mail")).slice(0, 200);
}

export async function POST(pedido: Request) {
  const cuerpo = await pedido.text();
  if (cuerpo.length > LIMITE) return respuesta(false, "Pedido demasiado grande", 413);
  let d: Record<string, unknown>;
  try { d = JSON.parse(cuerpo); } catch { return respuesta(false, "Pedido inválido", 400); }

  // 1. ¿Lo firmó esta base? (la firma cubre todo el cuerpo y la hora)
  const marca = Number(d.marca), firma = pedido.headers.get("x-firma") ?? "";
  const huella = createHash("sha256").update(cuerpo, "utf8").digest("hex");
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data: valido } = Number.isFinite(marca) ? await supabase.rpc("correo_verificar", { p_huella: huella, p_marca: marca, p_firma: firma }) : { data: false };
  if (!valido) return respuesta(false, "Pedido sin firma válida", 401);

  // 2. Datos del pedido (aunque venga firmado, se controla: un servidor mal escrito no tiene que llevar a ningún lado raro)
  const host = texto(d.host, 100), puerto = Number(d.puerto), usuario = texto(d.usuario, 200), clave = texto(d.clave, 300);
  const desde = email(d.desde_email), para = email(d.para), asunto = texto(d.asunto, 300), html = texto(d.html, 300_000);
  if (!host || !usuario || !clave || !desde || !para || !asunto || !html) return respuesta(false, "Faltan datos para mandar el mail", 400);
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(host) || host.toLowerCase() === "localhost") return respuesta(false, "El servidor de correo no es válido", 400);
  if (!PUERTOS.includes(puerto)) return respuesta(false, "Ese puerto no se usa para mandar mails", 400);

  try {
    const transporte = nodemailer.createTransport({
      host, port: puerto, secure: puerto === 465, auth: { user: usuario, pass: clave },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    });
    await transporte.sendMail({
      from: { name: texto(d.desde_nombre, 100) ?? "", address: desde }, to: para, subject: asunto, html,
      ...(email(d.responder_a) ? { replyTo: email(d.responder_a)! } : {}),
    });
    return respuesta(true);
  } catch (e) {
    return respuesta(false, explicar(e));
  }
}
