// Webhook de Mercado Pago: avisa cuando se crea o cambia un pago.
// Documentación: https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
//
// No se cree nada de lo que manda el aviso: la base verifica la firma (x-signature, con el secreto cargado en
// Integraciones) y le PREGUNTA a Mercado Pago el estado real del pago con su propio token (mp_notificacion).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  let cuerpo: { type?: string; action?: string; data?: { id?: string | number } } = {};
  try { cuerpo = await request.json(); } catch { /* algunos avisos vienen solo por la dirección */ }
  const tipo = q.get("type") ?? cuerpo.type ?? q.get("topic") ?? "";
  const id = String(q.get("data.id") ?? cuerpo.data?.id ?? q.get("id") ?? "");
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  // Una sola aplicación puede avisar de la tienda (pagos) y del posnet (órdenes): las órdenes van a Point
  if (tipo.startsWith("order")) {
    const { data, error } = await supabase.rpc("point_notificacion", { p_data_id: id, p_request_id: request.headers.get("x-request-id") ?? "", p_firma: request.headers.get("x-signature") ?? "" });
    if (error) console.error("[Mercado Pago Point] Error procesando el aviso:", error.message);
    if (data === "firma_invalida") return NextResponse.json({ status: "invalid_signature" }, { status: 401 });
    return NextResponse.json({ status: data ?? "error" }, { status: 200 });
  }
  const { data, error } = await supabase.rpc("mp_notificacion", {
    p_tipo: tipo, p_data_id: id, p_request_id: request.headers.get("x-request-id") ?? "", p_firma: request.headers.get("x-signature") ?? "",
  });
  if (error) console.error("[Mercado Pago] Error procesando el aviso:", error.message);
  if (data === "firma_invalida") return NextResponse.json({ status: "invalid_signature" }, { status: 401 });
  // 200 siempre que se pudo leer: si no, Mercado Pago reintenta el mismo aviso
  return NextResponse.json({ status: data ?? "error" }, { status: 200 });
}
