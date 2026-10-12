// Bot de WhatsApp potenciado por Google Gemini.
// Utiliza Function Calling nativo vía la API REST de Gemini para consultar stock, pedidos, horarios y promociones.

import { createClient } from "@supabase/supabase-js";
import { pesos } from "@/lib/formato";
import type { Database } from "@/lib/database.types";

function getSupabaseClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}

// ── Herramientas disponibles para la IA ─────────────────────────────────

async function toolConsultarCatalogo(busqueda?: string, categoria?: string, marca?: string) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("v_catalogo")
    .select("producto_id, nombre, categoria, marca, precio, escala")
    .gt("disponible", 0);

  if (busqueda) {
    query = query.ilike("nombre", `%${busqueda}%`);
  }
  if (categoria) {
    query = query.ilike("categoria", `%${categoria}%`);
  }
  if (marca) {
    query = query.ilike("marca", `%${marca}%`);
  }

  const { data, error } = await query.limit(20);
  if (error || !data || data.length === 0) {
    return { mensaje: "No se encontraron modelos con esos criterios con stock en el catálogo." };
  }

  // Agrupamos por producto_id para no repetir por cada variante en v_catalogo
  const unicos = new Map<number, { id: number; nombre: string; categoria: string; marca: string; precio: string }>();
  for (const item of data) {
    if (item.producto_id && !unicos.has(item.producto_id)) {
      unicos.set(item.producto_id, {
        id: item.producto_id,
        nombre: item.nombre ?? "",
        categoria: item.categoria ?? "",
        marca: item.marca ?? "",
        precio: item.precio ? pesos(item.precio) : "A consultar",
      });
    }
  }

  return {
    productos: Array.from(unicos.values()).slice(0, 6),
  };
}

async function toolConsultarStockYDisponibilidad(nombreModelo: string, talle?: string) {
  const supabase = getSupabaseClient();
  const { data: variantes, error } = await supabase
    .from("v_catalogo")
    .select("producto_id, nombre, talle, color, disponible, precio")
    .ilike("nombre", `%${nombreModelo}%`)
    .gt("disponible", 0);

  if (error || !variantes || variantes.length === 0) {
    return { mensaje: `No encontré disponibilidad ni stock para "${nombreModelo}". Puede que esté agotado o no exista ese modelo.` };
  }

  const items = variantes.map((v) => ({
    modelo: v.nombre ?? "",
    talle: v.talle ?? "",
    color: v.color ?? "",
    disponible: v.disponible ?? 0,
    precio: v.precio ? pesos(v.precio) : "",
  }));

  if (talle) {
    const coinciden = items.filter((i) => i.talle.toLowerCase() === talle.trim().toLowerCase());
    if (coinciden.length > 0) {
      return {
        disponible: true,
        talleBuscado: talle,
        opciones: coinciden,
      };
    } else {
      const otrosTalles = [...new Set(items.map((i) => i.talle))];
      return {
        disponible: false,
        mensaje: `No tenemos en talle ${talle}. Pero sí hay stock disponible en talle: ${otrosTalles.join(", ")}.`,
      };
    }
  }

  return {
    disponibles: items.map((i) => `${i.modelo} - Talle ${i.talle} (${i.color}) - Quedan ${i.disponible}`),
    precio: items[0]?.precio,
  };
}

async function toolConsultarEstadoPedido(comprobante: string, telefonoRemitente: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .rpc("consultar_pedido_whatsapp", {
      p_comprobante: comprobante.trim(),
      p_telefono: telefonoRemitente,
    })
    .maybeSingle();
  if (error || !data) {
    return { mensaje: `No encontré ese pedido para este número de WhatsApp. Verificá el comprobante completo (por ejemplo, 0001-00000015).` };
  }

  const estadosExplicados: Record<string, string> = {
    pendiente: "Recibido y pendiente de confirmación",
    confirmado: "Confirmado, te estamos reservando los pares",
    preparado: "Listo para retirar o despachar",
    entregado: "Entregado",
    cancelado: "Cancelado",
  };

  return {
    comprobante: data.comprobante,
    estado: estadosExplicados[data.estado] ?? data.estado,
    entrega: data.entrega === "retiro" ? "Retiro en el local" : "Envío a domicilio",
    total: pesos(Number(data.total)),
  };
}

async function toolDatosDelLocal() {
  const supabase = getSupabaseClient();
  const { data: tienda } = await supabase
    .from("configuracion_tienda")
    .select("nombre, direccion_retiro, horario, whatsapp")
    .single();

  const { data: medios } = await supabase
    .from("medios_pago")
    .select("nombre, ajuste_pct, cuotas")
    .eq("en_tienda", true)
    .eq("activo", true);

  return {
    nombreTienda: tienda?.nombre ?? "Nuestro Local",
    direccion: tienda?.direccion_retiro ?? "Consultar por WhatsApp",
    horario: tienda?.horario ?? "Consultar por WhatsApp",
    mediosDePago: medios?.map((m) => {
      let desc = m.nombre;
      if (m.ajuste_pct && m.ajuste_pct < 0) desc += ` (${Math.abs(m.ajuste_pct)}% OFF)`;
      if (m.ajuste_pct && m.ajuste_pct > 0) desc += ` (+${m.ajuste_pct}% recargo)`;
      if (m.cuotas && m.cuotas > 1) desc += ` hasta en ${m.cuotas} cuotas`;
      return desc;
    }),
  };
}

// ── Definición de herramientas para Gemini ──────────────────────────────

const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "consultarCatalogo",
        description: "Busca productos y modelos en el catálogo disponible.",
        parameters: {
          type: "OBJECT",
          properties: {
            busqueda: { type: "STRING", description: "Término de búsqueda o modelo (ej. 'Running', 'Mocasín')" },
            categoria: { type: "STRING", description: "Categoría o rubro (ej. 'Zapatillas', 'Zapatos')" },
            marca: { type: "STRING", description: "Marca si la menciona (ej. 'Nike', 'Adidas')" },
          },
        },
      },
      {
        name: "consultarStockYDisponibilidad",
        description: "Consulta si hay stock real disponible para un modelo, y en qué talles o colores.",
        parameters: {
          type: "OBJECT",
          properties: {
            nombreModelo: { type: "STRING", description: "Nombre del modelo a consultar (ej. 'Running Pro')" },
            talle: { type: "STRING", description: "Talle específico consultado (ej. '41', '42')" },
          },
          required: ["nombreModelo"],
        },
      },
      {
        name: "consultarEstadoPedido",
        description: "Consulta el estado actual de un pedido de compra realizado por el cliente usando su código o comprobante.",
        parameters: {
          type: "OBJECT",
          properties: {
            comprobante: { type: "STRING", description: "Comprobante completo del pedido (ej. '0001-00000015')" },
          },
          required: ["comprobante"],
        },
      },
      {
        name: "datosDelLocal",
        description: "Obtiene horarios de atención, dirección física para retirar y medios de pago vigentes.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
    ],
  },
];

const SYSTEM_INSTRUCTION = `Sos el asistente virtual de un local de calzado e indumentaria masculina en Argentina.
Tu objetivo es responder consultas de clientes por WhatsApp de manera amigable, ágil y precisa en castellano rioplatense (usá "vos", "che", "tenemos", etc.).

Reglas clave:
1. Usá las herramientas provistas para responder con datos REALES. Nunca inventes stock, precios ni direcciones.
2. Si un cliente pregunta por un modelo, consultá catálogo o stock. Si no hay el talle que pide, mencioná qué talles SÍ tenemos disponibles.
3. Si pregunta por el estado de su pedido, pedile el número o comprobante si no lo dio, y consultalo con la herramienta.
4. Mantené respuestas breves y directas aptas para WhatsApp (máximo 3 párrafos cortos, podés usar emojis con moderación).
5. Si no sabés algo o el cliente pide hablar con un humano o coordinar algo especial, decile amablemente que el equipo del local le va a responder a la brevedad.`;

export async function procesarMensajeConIA(mensajeUsuario: string, telefonoRemitente: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    console.warn("[Bot WhatsApp] Sin GEMINI_API_KEY configurada. Respuesta por defecto.");
    return "¡Hola! Gracias por comunicarte con nuestro local. Recibimos tu mensaje y un miembro de nuestro equipo te va a responder en breve.";
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const contents: Array<Record<string, unknown>> = [
      {
        role: "user",
        parts: [{ text: mensajeUsuario }],
      },
    ];

    let res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        tools: GEMINI_TOOLS,
      }),
    });

    if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
    let data = await res.json();
    let candidate = data?.candidates?.[0]?.content;

    const call = candidate?.parts?.find((p: { functionCall?: unknown }) => p.functionCall)?.functionCall;

    if (call) {
      const toolName = call.name;
      const toolArgs = call.args || {};
      let toolResult: unknown = {};

      if (toolName === "consultarCatalogo") {
        toolResult = await toolConsultarCatalogo(toolArgs.busqueda, toolArgs.categoria, toolArgs.marca);
      } else if (toolName === "consultarStockYDisponibilidad") {
        toolResult = await toolConsultarStockYDisponibilidad(toolArgs.nombreModelo, toolArgs.talle);
      } else if (toolName === "consultarEstadoPedido") {
        toolResult = await toolConsultarEstadoPedido(toolArgs.comprobante, telefonoRemitente);
      } else if (toolName === "datosDelLocal") {
        toolResult = await toolDatosDelLocal();
      }

      contents.push(candidate);
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: { content: toolResult },
            },
          },
        ],
      });

      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          tools: GEMINI_TOOLS,
        }),
      });

      if (!res.ok) throw new Error(`Gemini respondió ${res.status}`);
      data = await res.json();
      candidate = data?.candidates?.[0]?.content;
    }

    const textoRespuesta = candidate?.parts?.find((p: { text?: string }) => p.text)?.text;
    return textoRespuesta || "¡Hola! Gracias por escribirnos. ¿En qué te podemos ayudar?";
  } catch (err) {
    console.error("[Bot WhatsApp] Error al invocar Gemini:", err);
    return "¡Hola! Recibimos tu consulta. En un momento te respondemos desde el local.";
  }
}
