"use server";
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";
import { leerMonto } from "@/lib/formato";

export type Estado = { error?: string; ok?: string };

// Avanza el pedido. Al pasar a "entregado" la base crea la venta; al "cancelado" (con motivo), libera el stock reservado.
// El aviso por WhatsApp al cliente lo manda la base sola al cambiar el estado (si está activado en Tienda online).
export async function cambiarEstado(_: Estado, f: FormData): Promise<Estado> {
  const pedido = Number(f.get("pedido_id"));
  const estado = String(f.get("estado"));
  // Sin pagos, la base cobra con el medio y el % del pedido; si al entregar paga con otro, se manda ese
  const otroMedio = f.get("cambio_medio") ? Number(f.get("medio_pago_id")) : null;
  const motivo = String(f.get("motivo") ?? "");
  if (estado === "cancelado" && !motivo) return { error: "Elegí el motivo de la cancelación" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("cambiar_estado_pedido", {
    p_pedido: pedido, p_estado: estado, p_comentario: String(f.get("comentario") ?? "").trim() || undefined,
    p_pagos: estado === "entregado" && otroMedio ? [{ medio_pago_id: otroMedio }] : [],
    p_motivo: estado === "cancelado" ? motivo : undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: estado === "entregado" ? "Entregado: la venta quedó registrada" : estado === "cancelado" ? "Cancelado: el stock volvió a estar a la venta" : "Estado actualizado" };
}

// Cómo salió el envío: con qué (Uber, cadete…), lo que costó (va a Gastos → Envíos) y el seguimiento (lo ve el cliente)
export async function registrarEnvio(_: Estado, f: FormData): Promise<Estado> {
  const costo = leerMonto(String(f.get("costo_real") ?? ""));
  if (costo !== null && !(costo >= 0)) return { error: "El costo tiene que ser un número" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("registrar_envio", {
    p_pedido: Number(f.get("pedido_id")), p_proveedor: String(f.get("proveedor") || "uber"), p_costo_real: costo ?? undefined,
    p_seguimiento: String(f.get("seguimiento") ?? "").trim() || undefined, p_notas: String(f.get("notas") ?? "").trim() || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/pedidos", "layout");
  return { ok: "Envío anotado" };
}
