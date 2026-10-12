// Webhook para Meta WhatsApp Cloud API.
// Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks

import { createHmac, timingSafeEqual } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { enviarMensajeTexto, marcarMensajeLeido } from "@/lib/whatsapp/meta";
import { procesarMensajeConIA } from "@/lib/whatsapp/bot";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function getSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

export const maxDuration = 30;

function firmaValida(payload: string, firma: string | null) {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  if (!secreto || !firma?.startsWith("sha256=")) return false;
  const esperada = Buffer.from(createHmac("sha256", secreto).update(payload).digest("hex"));
  const recibida = Buffer.from(firma.slice(7));
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

async function procesarMensaje(body: Record<string, unknown>) {
  const entry = (body.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;
  const message = (value?.messages as Array<Record<string, unknown>> | undefined)?.[0];

  if (!message || message.type !== "text") return;
  const from = typeof message.from === "string" ? message.from : "";
  const messageId = typeof message.id === "string" ? message.id : "";
  const textoEntrante = (message.text as { body?: unknown } | undefined)?.body;
  if (!from || typeof textoEntrante !== "string" || !textoEntrante.trim()) return;

  console.log(`[Webhook WhatsApp] Mensaje de texto recibido de ${from}.`);
  if (messageId) await marcarMensajeLeido(messageId);

  const supabase = getSupabaseClient();
  const { data: config } = await supabase
    .from("configuracion_tienda")
    .select("wa_bot_activo")
    .single();

  if (config?.wa_bot_activo === false) {
    console.log("[Webhook WhatsApp] Bot de IA desactivado en la configuración.");
    return;
  }

  const respuesta = await procesarMensajeConIA(textoEntrante, from);
  if (respuesta) await enviarMensajeTexto(from, respuesta);
}

/**
 * Verificación del Webhook por parte de Meta (GET).
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token && challenge) {
    if (token === verifyToken) {
      console.log("[Webhook WhatsApp] Webhook verificado correctamente.");
      return new NextResponse(challenge, { status: 200 });
    } else {
      console.warn("[Webhook WhatsApp] Token de verificación inválido:", token);
      return new NextResponse("Token de verificación incorrecto", { status: 403 });
    }
  }

  return new NextResponse("Parámetros de verificación faltantes", { status: 400 });
}

/**
 * Recepción de eventos y mensajes entrantes de WhatsApp (POST).
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    if (!firmaValida(payload, request.headers.get("x-hub-signature-256"))) {
      console.warn("[Webhook WhatsApp] Firma inválida o WHATSAPP_APP_SECRET ausente.");
      return NextResponse.json({ status: "invalid_signature" }, { status: 401 });
    }

    const body = JSON.parse(payload) as Record<string, unknown>;

    if (body.object !== "whatsapp_business_account") {
      return NextResponse.json({ status: "ignored" }, { status: 200 });
    }

    after(() => procesarMensaje(body).catch((error) => {
      console.error("[Webhook WhatsApp] Error procesando mensaje:", error);
    }));

    return NextResponse.json({ status: "accepted" }, { status: 200 });
  } catch (error) {
    console.error("[Webhook WhatsApp] Error procesando webhook:", error);
    return NextResponse.json({ status: "error" }, { status: 200 });
  }
}
