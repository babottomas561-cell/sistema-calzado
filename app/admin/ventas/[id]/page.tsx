// Detalle de una venta (también es el comprobante que se puede mostrar o imprimir).
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, pesos, porcentaje } from "@/lib/formato";
import { CircleCheck, Plus } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";

export default async function Venta({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }>;
}) {
  await exigir("ventas.registrar", "ventas.ver_todas");
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  const supabase = await crearCliente();
  const [{ data: v }, { data: items }] = await Promise.all([
    supabase.from("ventas").select("*, clientes(id, nombre, telefono), vendedor:perfiles(nombre), pagos(base, ajuste_pct, ajuste, monto, cuotas, referencia, medios_pago(nombre))").eq("id", Number(id)).single(),
    supabase.from("v_venta_items").select("id, nombre, marca, talle, color, cantidad, precio_unitario, subtotal").eq("venta_id", Number(id)),
  ]);
  if (!v) notFound();
  const cliente = v.clientes as { id: number; nombre: string; telefono: string | null } | null;
  const pagos = v.pagos as unknown as { base: number; ajuste_pct: number; ajuste: number; monto: number; cuotas: number; referencia: string | null; medios_pago: { nombre: string } }[];
  const cobrado = pagos.reduce((s, p) => s + Number(p.base), 0);
  const saldo = Number(v.subtotal) - Number(v.descuento) - cobrado;   // lo que no se cobró (cuenta corriente)

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {nueva && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={18} /> Venta registrada. El stock ya se descontó.</div>}
      <div className="flex items-center justify-between">
        <Volver href="/admin/ventas">Ventas</Volver>
        <Link href="/admin/ventas/nueva" className="boton-sec"><Plus size={16} /> Otra venta</Link>
      </div>
      <div className="tarjeta space-y-4">
        <div className="flex justify-between">
          <div><h1 className="text-xl font-bold">Venta <span className="font-mono">{v.comprobante}</span></h1><p className="text-sm text-texto-2">{fechaHora(v.fecha)}{v.vendedor ? ` · vendió ${(v.vendedor as { nombre: string | null }).nombre ?? "—"}` : ""}</p></div>
          <div className="text-right text-sm"><div className="font-semibold">{v.canal}{v.pedido_id ? <> · <a href={`/admin/pedidos/${v.pedido_id}`} className="text-marca">ver pedido</a></> : null}</div>
            <div className="text-texto-2">{cliente ? <a href={`/admin/clientes/${cliente.id}`} className="text-marca">{cliente.nombre}</a> : "Sin cliente"}</div></div>
        </div>
        <table className="tabla">
          <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}><td>{i.nombre}<div className="text-xs text-texto-2">Talle {i.talle} · {i.color}</div></td>
                <td className="text-right">{i.cantidad}</td><td className="text-right">{pesos(i.precio_unitario)}</td><td className="text-right">{pesos(i.subtotal)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-texto-2"><span>Subtotal</span><span>{pesos(v.subtotal)}</span></div>
          {Number(v.descuento) > 0 && <div className="flex justify-between text-ok"><span>Descuento</span><span>−{pesos(v.descuento)}</span></div>}
          {Number(v.ajuste_medio_pago) !== 0 && <div className={`flex justify-between ${Number(v.ajuste_medio_pago) < 0 ? "text-ok" : "text-alerta"}`}>
            <span>{Number(v.ajuste_medio_pago) < 0 ? "Descuento" : "Recargo"} por medio de pago</span><span>{Number(v.ajuste_medio_pago) < 0 ? "−" : "+"}{pesos(Math.abs(Number(v.ajuste_medio_pago)))}</span></div>}
          <div className="flex justify-between border-t border-borde pt-2 text-lg font-bold"><span>Total</span><span>{pesos(v.total)}</span></div>
          <div className="space-y-1 pt-2">{pagos.map((p, i) => (
            <div key={i} className="flex justify-between text-texto-2">
              <span>{p.medios_pago.nombre}{Number(p.ajuste_pct) ? ` (${porcentaje(p.ajuste_pct)} sobre ${pesos(p.base)})` : ""}
                {p.cuotas > 1 ? ` · ${p.cuotas} cuotas de ${pesos(Number(p.monto) / p.cuotas)}` : ""}{p.referencia ? ` · ${p.referencia}` : ""}</span>
              <span>{pesos(p.monto)}</span></div>))}</div>
          {saldo > 0.01 && <div className="flex justify-between rounded-lg bg-amber-50 px-2 py-1 font-semibold text-alerta"><span>Saldo sin cobrar</span><span>{pesos(saldo)}</span></div>}
        </div>
      </div>
    </div>
  );
}
