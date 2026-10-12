// Cliente para la API oficial de Meta WhatsApp Cloud API.
// Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api

export interface EnviarMensajeRespuesta {
  ok: boolean;
  messageId?: string;
  error?: string;
}

const META_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";

/**
 * Normaliza un número telefónico para WhatsApp (formato E.164 sin símbolos ni espacios).
 */
export function normalizarTelefono(numero: string): string {
  let limpio = numero.replace(/\D/g, "");
  // Si es de Argentina y empieza con 0, sacar el 0
  if (limpio.startsWith("54") && !limpio.startsWith("549") && limpio.length === 12) {
    limpio = "549" + limpio.slice(2);
  }
  return limpio;
}

/**
 * Envía un mensaje de texto plano a un número de WhatsApp usando Meta Cloud API.
 */
export async function enviarMensajeTexto(
  destinatario: string,
  texto: string
): Promise<EnviarMensajeRespuesta> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  const to = normalizarTelefono(destinatario);

  if (!token || !phoneId) {
    console.warn("[WhatsApp Meta] Faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID.");
    return { ok: false, error: "La conexión con WhatsApp todavía no está configurada" };
  }

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body: texto },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("[WhatsApp Meta] Error al enviar mensaje:", data);
      return { ok: false, error: data?.error?.message || "Error al enviar mensaje a WhatsApp" };
    }

    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : "Error inesperado";
    console.error("[WhatsApp Meta] Excepción al enviar mensaje:", err);
    return { ok: false, error: mensaje };
  }
}

/** Envía una plantilla aprobada por Meta para avisos iniciados por el local. */
export async function enviarMensajePlantilla(
  destinatario: string,
  plantilla: string,
  parametros: string[],
  idioma = "es_AR"
): Promise<EnviarMensajeRespuesta> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: "La conexión con WhatsApp todavía no está configurada" };

  try {
    const res = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizarTelefono(destinatario),
        type: "template",
        template: {
          name: plantilla,
          language: { code: idioma },
          components: [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }],
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.error?.message || "Meta rechazó la plantilla" };
    return { ok: true, messageId: data?.messages?.[0]?.id };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Error inesperado" };
  }
}

/**
 * Marca un mensaje entrante como leído en WhatsApp (doble tilde azul).
 */
export async function marcarMensajeLeido(messageId: string): Promise<boolean> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) return false;

  try {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
