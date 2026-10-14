// El comprobante en PDF, por el mismo link privado que ya recibe el cliente (/comprobante/<token>/pdf). Lo usan el mail (va adjunto) y el botón de descargar.
// Sin token válido (o revocado) no hay nada: 404, igual que la página.
import { crearCliente } from "@/lib/supabase/server";
import { leerComprobante, numeroDe } from "@/lib/comprobante";
import { comprobantePdf } from "@/lib/comprobante-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(pedido: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("comprobante_publico", { p_token: token });
  const c = error ? null : leerComprobante(data);
  if (!c) return new Response("No encontrado", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
  const origen = new URL(pedido.url).origin;
  const pdf = await comprobantePdf(c, `${origen}/comprobante/${token}`);
  const nombre = `Comprobante-${numeroDe(c).replace(/[^A-Za-z0-9-]/g, "")}.pdf`;
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}
