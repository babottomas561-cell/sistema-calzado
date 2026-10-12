// Webhook para Meta WhatsApp Cloud API.
// Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
//
// Las claves NO están acá ni en Vercel: se cargan en el panel (Configuración → Integraciones) y viven en la base, que
// nadie puede leer. Este webhook le pasa a la base el cuerpo crudo y la firma de Meta: la base verifica la firma,
// registra lo cobrado, marca leído y devuelve los mensajes (y la clave de la IA si el bot está activo). Las respuestas
// también las manda la base, y solo a quien escribió en ese mismo aviso firmado.
import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { procesarMensajeConIA } from "@/lib/whatsapp/bot";
import type { Database } from "@/lib/database.types";

export const maxDuration = 30;

const base = () => createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);

type Recibido = { ok: boolean; mensajes?: { de: string; id: string; texto: string }[]; bot_activo?: boolean; ia_modelo?: string; gemini_api_key?: string | null };

// Verificación del webhook (Meta la hace una vez, al configurarlo)
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const [modo, token, desafio] = [q.get("hub.mode"), q.get("hub.verify_token"), q.get("hub.challenge")];
  if (modo !== "subscribe" || !token || !desafio) return new NextResponse("Faltan parámetros de verificación", { status: 400 });
  const { data: valido } = await base().rpc("wa_verificar_token", { p_token: token });
  return valido ? new NextResponse(desafio, { status: 200 }) : new NextResponse("Token de verificación incorrecto", { status: 403 });
}

// Mensajes y avisos de estado
export async function POST(request: NextRequest) {
  const cuerpo = await request.text();
  const firma = request.headers.get("x-hub-signature-256") ?? "";
  const supabase = base();
  const { data, error } = await supabase.rpc("wa_recibir", { p_payload: cuerpo, p_firma: firma });
  const r = data as Recibido | null;
  if (error) {
    console.error("[Webhook WhatsApp] Error de la base:", error.message);
    return NextResponse.json({ status: "error" }, { status: 200 });   // 200: si no, Meta reintenta en loop
  }
  if (!r?.ok) return NextResponse.json({ status: "invalid_signature" }, { status: 401 });

  if (r.bot_activo && r.mensajes?.length) {
    // Se contesta después de responderle a Meta (tiene que recibir el 200 rápido)
    after(async () => {
      for (const m of r.mensajes ?? []) {
        try {
          const r2 = await procesarMensajeConIA(m.texto, m.de, r.gemini_api_key ?? null, r.ia_modelo ?? "gemini-2.5-flash");
          if (r2.texto) await supabase.rpc("wa_responder", { p_payload: cuerpo, p_firma: firma, p_para: m.de, p_texto: r2.texto });
          // Lo que usó de la IA queda registrado (y, con precio cargado, como gasto)
          if (r2.consultas)
            await supabase.rpc("ia_registrar_uso", { p_payload: cuerpo, p_firma: firma, p_tokens_entrada: r2.tokensEntrada, p_tokens_salida: r2.tokensSalida, p_consultas: r2.consultas });
        } catch (e) {
          console.error("[Webhook WhatsApp] Error contestando:", e);
        }
      }
    });
  }
  return NextResponse.json({ status: "accepted" }, { status: 200 });
}
