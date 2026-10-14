// Webhook de Mercado Pago Point (evento «Order»): avisa cuando el cobro en el posnet cambia de estado.
// La base verifica la firma (x-signature, con la clave secreta de la app de Point) y CONSULTA la orden a Mercado Pago:
// nada de lo que trae el aviso se da por cierto (point_notificacion).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  let cuerpo: { data?: { id?: string | number } } = {};
  try { cuerpo = await request.json(); } catch { /* algunos avisos vienen solo por la dirección */ }
  const id = String(q.get("data.id") ?? cuerpo.data?.id ?? q.get("id") ?? "");
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
  const { data, error } = await supabase.rpc("point_notificacion", {
    p_data_id: id, p_request_id: request.headers.get("x-request-id") ?? "", p_firma: request.headers.get("x-signature") ?? "",
  });
  if (error) console.error("[Mercado Pago Point] Error procesando el aviso:", error.message);
  if (data === "firma_invalida") return NextResponse.json({ status: "invalid_signature" }, { status: 401 });
  // 200 siempre que se pudo leer: si no, Mercado Pago reintenta el mismo aviso
  return NextResponse.json({ status: data ?? "error" }, { status: 200 });
}
