import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, fechaHora, pesos } from "@/lib/formato";
import Volver from "@/components/Volver";
import { CircleCheck } from "lucide-react";
import { exigir } from "@/lib/exigir";

export default async function Compra({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }>;
}) {
  await exigir("compras.registrar");
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  const supabase = await crearCliente();
  const [{ data: c }, { data: items }] = await Promise.all([
    supabase.from("compras").select("*, proveedores(nombre)").eq("id", Number(id)).single(),
    supabase.from("compra_items").select("id, cantidad, costo_unitario, variantes(talles(nombre), colores(nombre), productos(nombre))").eq("compra_id", Number(id)),
  ]);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      {nueva && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={18} /> Compra registrada. El stock ya se sumó y se actualizaron los precios de compra.</div>}
      <Volver href="/admin/compras">Compras</Volver>
      <div className="tarjeta space-y-3">
        <div className="flex justify-between"><div><h1 className="text-xl font-bold">Compra <span className="font-mono">{c.comprobante}</span></h1><p className="text-sm text-texto-2">{fechaHora(c.fecha)}</p></div>
          <div className="text-right text-sm"><div className="font-semibold">{(c.proveedores as { nombre: string } | null)?.nombre ?? "Sin proveedor"}</div><div className="text-texto-2">{c.comprobante_proveedor ? `Factura/remito ${c.comprobante_proveedor}` : ""}{c.fecha_comprobante ? ` del ${fecha(c.fecha_comprobante + "T12:00:00")}` : ""}</div><div className="text-texto-2">{c.notas}</div></div></div>
        <table className="tabla">
          <thead><tr><th>Producto</th><th className="text-right">Unidades</th><th className="text-right">Costo</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => {
              const v = i.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } };
              return <tr key={i.id}><td>{v.productos.nombre}<div className="text-xs text-texto-2">Talle {v.talles.nombre} · {v.colores.nombre}</div></td>
                <td className="text-right">{i.cantidad}</td><td className="text-right">{pesos(i.costo_unitario)}</td><td className="text-right">{pesos(i.cantidad * Number(i.costo_unitario))}</td></tr>;
            })}
          </tbody>
        </table>
        <div className="flex justify-between border-t border-borde pt-2 text-lg font-bold"><span>Total</span><span>{pesos(c.total)}</span></div>
      </div>
    </div>
  );
}
