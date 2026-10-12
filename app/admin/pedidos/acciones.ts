"use server";
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { enviarMensajeTexto } from "@/lib/whatsapp/meta";

export type Estado = { error?: string; ok?: string };

// Avanza el pedido. Al pasar a "entregado" la base crea la venta; al "cancelado" (con motivo), libera el stock reservado.
export async function cambiarEstado(_: Estado, f: FormData): Promise<Estado> {
  const pedido = Number(f.get("pedido_id"));
  const estado = String(f.get("estado"));
  // Sin pagos, la base cobra con el medio y el % del pedido; si al entregar paga con otro, se manda ese
  const otroMedio = f.get("cambio_medio") ? Number(f.get("medio_pago_id")) : null;
  const motivo = String(f.get("motivo") ?? "");
  if (estado === "cancelado" && !motivo) return { error: "Elegí el motivo de la cancelación" };
  const supabase = await crearCliente();

  // Obtenemos los datos del pedido y el cliente para enviar notificación si aplica
  const [{ data: datosPedido }, { data: configTienda }] = await Promise.all([
    supabase
      .from("pedidos")
      .select("comprobante, entrega, clientes(nombre, telefono)")
      .eq("id", pedido)
      .single(),
    supabase
      .from("configuracion_tienda")
      .select("wa_notificaciones_pedidos")
      .single(),
  ]);

  const { error } = await supabase.rpc("cambiar_estado_pedido", {
    p_pedido: pedido, p_estado: estado, p_comentario: String(f.get("comentario") ?? "").trim() || undefined,
    p_pagos: estado === "entregado" && otroMedio ? [{ medio_pago_id: otroMedio }] : [],
    p_motivo: estado === "cancelado" ? motivo : undefined,
  });
  if (error) return { error: error.message };

  // Notificación automática por WhatsApp al cliente si tiene teléfono cargado y está habilitada
  const notificacionesActivas = configTienda?.wa_notificaciones_pedidos !== false;
  const cliente = datosPedido?.clientes as unknown as { nombre: string | null; telefono: string | null } | null;
  const telefono = cliente?.telefono;
  let avisoNotificacion: string | null = null;

  if (notificacionesActivas && telefono && datosPedido?.comprobante) {
    let mensajeAviso: string | null = null;
    const nombre = cliente?.nombre ? ` ${cliente.nombre}` : "";

    if (estado === "confirmado") {
      mensajeAviso = `¡Hola${nombre}! Tu pedido *${datosPedido.comprobante}* fue confirmado y ya te reservamos los pares.`;
    } else if (estado === "preparado") {
      if (datosPedido.entrega === "retiro") {
        mensajeAviso = `¡Hola${nombre}! Tu pedido *${datosPedido.comprobante}* ya está listo para retirar en el local. ¡Te esperamos!`;
      } else {
        mensajeAviso = `¡Hola${nombre}! Tu pedido *${datosPedido.comprobante}* ya está embalado y listo para ser despachado.`;
      }
    } else if (estado === "entregado") {
      mensajeAviso = `¡Hola${nombre}! Tu pedido *${datosPedido.comprobante}* figura como entregado. ¡Muchas gracias por tu compra!`;
    } else if (estado === "cancelado") {
      mensajeAviso = `Hola${nombre}. Te informamos que tu pedido *${datosPedido.comprobante}* fue cancelado. Cualquier consulta no dudes en escribirnos.`;
    }

    if (mensajeAviso) {
      const envio = await enviarMensajeTexto(telefono, mensajeAviso);
      if (!envio.ok) {
        console.error("[Notificación Pedido WhatsApp] Error al enviar:", envio.error);
        avisoNotificacion = " El estado se guardó, pero no se pudo enviar el aviso por WhatsApp.";
      }
    }
  }

  revalidatePath("/", "layout");
  const resultado = estado === "entregado" ? "Entregado: la venta quedó registrada" : estado === "cancelado" ? "Cancelado: el stock volvió a estar a la venta" : "Estado actualizado";
  return { ok: resultado + (avisoNotificacion ?? "") };
}
