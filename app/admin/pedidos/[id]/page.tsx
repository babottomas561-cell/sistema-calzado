import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, pesos, porcentaje } from "@/lib/formato";
import { ESTADOS } from "@/lib/estados-pedido";
import Acciones from "./Acciones";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";

export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  await exigir("pedidos.gestionar");
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: p }, { data: items }, { data: historial }, { data: venta }] = await Promise.all([
    supabase.from("pedidos").select("*, clientes(id, nombre, telefono, email), medios_pago(nombre)").eq("id", Number(id)).single(),
    supabase.from("pedido_items").select("id, cantidad, precio_unitario, variantes(talles(nombre), colores(nombre), productos(nombre))").eq("pedido_id", Number(id)),
    supabase.from("pedido_estados").select("id, estado, fecha, comentario").eq("pedido_id", Number(id)).order("fecha"),
    supabase.from("ventas").select("id, comprobante").eq("pedido_id", Number(id)).maybeSingle(),
  ]);
  const { data: medios } = await supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).order("orden");
  if (!p) notFound();
  const medio = (p.medios_pago as unknown as { nombre: string }).nombre;
  const c = p.clientes as unknown as { id: number; nombre: string; telefono: string | null; email: string | null };

  return (
    <div className="space-y-4">
      <Volver href="/admin/pedidos">Pedidos</Volver>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Pedido <span className="font-mono">{p.comprobante}</span></h1>
        <span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span>
        {venta && <Link href={`/admin/ventas/${venta.id}`} className="text-sm text-marca">→ Venta {venta.comprobante}</Link>}</div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="tarjeta">
            <table className="tabla">
              <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
              <tbody>{(items ?? []).map((i) => {
                const v = i.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } };
                return <tr key={i.id}><td>{v.productos.nombre}<div className="text-xs text-texto-2">Talle {v.talles.nombre} · {v.colores.nombre}</div></td>
                  <td className="text-right">{i.cantidad}</td><td className="text-right">{pesos(i.precio_unitario)}</td><td className="text-right">{pesos(i.cantidad * Number(i.precio_unitario))}</td></tr>;
              })}</tbody>
            </table>
            <div className="mt-2 space-y-1 text-sm">
              {Number(p.ajuste_medio_pago) !== 0 && <>
                <div className="flex justify-between text-texto-2"><span>Subtotal</span><span>{pesos(p.subtotal)}</span></div>
                <div className={`flex justify-between ${Number(p.ajuste_medio_pago) < 0 ? "text-ok" : "text-alerta"}`}>
                  <span>{medio} ({porcentaje(p.ajuste_pct)})</span><span>{Number(p.ajuste_medio_pago) < 0 ? "−" : "+"}{pesos(Math.abs(Number(p.ajuste_medio_pago)))}</span></div></>}
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{pesos(p.total)}</span></div>
            </div>
          </section>
          <section className="tarjeta">
            <h2 className="mb-2 font-semibold">Seguimiento (lo ve el cliente)</h2>
            <ol className="space-y-2 text-sm">{(historial ?? []).map((h) => (
              <li key={h.id} className="flex gap-3"><span className={`chip h-fit ${ESTADOS[h.estado]?.color ?? "bg-gray-100"}`}>{ESTADOS[h.estado]?.texto ?? h.estado}</span>
                <div><div className="text-texto-2">{fechaHora(h.fecha)}</div>{h.comentario && <div>{h.comentario}</div>}</div></li>
            ))}</ol>
          </section>
        </div>
        <div className="space-y-4">
          <section className="tarjeta text-sm">
            <h2 className="mb-2 font-semibold">Cliente</h2>
            <Link href={`/admin/clientes/${c.id}`} className="font-semibold text-marca">{c.nombre}</Link>
            <div>{c.telefono}</div><div className="text-texto-2">{c.email}</div>
            <div className="mt-3 border-t border-borde pt-3">
              <div><b>Entrega:</b> {p.entrega === "envio" ? `Envío a ${p.direccion_envio}` : "Retira en el local"}</div>
              <div><b>Pago:</b> {medio}{Number(p.ajuste_pct) ? ` (${porcentaje(p.ajuste_pct)})` : ""}</div>
              {p.notas && <div><b>Notas:</b> {p.notas}</div>}
            </div>
          </section>
          {ESTADOS[p.estado].siguientes.length > 0 && <Acciones key={p.estado} pedido={p.id} siguientes={ESTADOS[p.estado].siguientes} medios={medios ?? []}
            elegido={{ id: p.medio_pago_id, ajuste_pct: Number(p.ajuste_pct) }} subtotal={Number(p.subtotal)} />}
        </div>
      </div>
    </div>
  );
}
