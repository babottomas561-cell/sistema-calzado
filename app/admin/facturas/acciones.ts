"use server";
// Facturas: facturar en tanda las ventas que salieron sin factura. La base crea cada factura y la cola las manda a ARCA de a poco.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export async function facturarEnTanda(ventas: number[]): Promise<{ error?: string; ok?: string; errores?: { venta: string; error: string }[] }> {
  if (!ventas.length) return { error: "Elegí al menos una venta" };
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("facturar_en_tanda", { p_ventas: ventas });
  if (error) return { error: error.message };
  const r = data as { creadas: number; errores: { venta: string; error: string }[] };
  revalidatePath("/admin/facturas");
  return {
    ok: r.creadas ? `${r.creadas} ${r.creadas === 1 ? "factura creada" : "facturas creadas"}: se mandan a ARCA solas en los próximos minutos.` : undefined,
    errores: r.errores,
  };
}
