// Ficha del cliente (CRM): resumen, compras, pedidos y seguimientos.
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { dia, fecha, fechaHora, pesos } from "@/lib/formato";
import FichaForm, { type FichaCliente } from "../FichaForm";
import NuevaInteraccion from "./NuevaInteraccion";
import { marcarHecha } from "../acciones";
import { Check, MessageCircle, Pencil } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";

export default async function FichaCliente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ editar?: string }> }) {
  const { permisos } = await exigir("clientes.ver");
  const { id } = await params;
  const { editar } = await searchParams;
  const supabase = await crearCliente();
  const { data: fac } = await supabase.rpc("facturacion_caja");
  const letraLocal = (fac as { activa?: boolean; letra?: string | null } | null)?.activa ? ((fac as { letra?: string | null }).letra ?? null) : null;
  const [{ data: c }, { data: ventas }, { data: pedidos }, { data: interacciones }, { data: items }, { data: creditos }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", Number(id)).single(),
    supabase.from("ventas").select("id, comprobante, fecha, total, canal").eq("cliente_id", Number(id)).is("anulada_en", null).order("fecha", { ascending: false }),
    supabase.from("pedidos").select("id, comprobante, fecha, total, estado").eq("cliente_id", Number(id)).order("fecha", { ascending: false }),
    supabase.from("interacciones").select("*").eq("cliente_id", Number(id)).order("fecha", { ascending: false }),
    supabase.from("v_venta_items").select("nombre, talle, cantidad").eq("cliente_id", Number(id)).eq("anulada", false),
    supabase.from("v_creditos").select("id, fecha, monto, restante, vence, devolucion, devolucion_id").eq("cliente_id", Number(id)).order("fecha", { ascending: false }),
  ]);
  const hoyAR = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  const saldo = (creditos ?? []).filter((x) => (x.vence ?? "") >= hoyAR).reduce((s, x) => s + Number(x.restante), 0);
  if (!c) notFound();

  const total = (ventas ?? []).reduce((s, v) => s + Number(v.total), 0);
  const compras = ventas?.length ?? 0;
  // Talle que más compra (útil para avisarle cuando entra mercadería)
  const porTalle = new Map<string, number>();
  (items ?? []).forEach((i) => i.talle && porTalle.set(i.talle, (porTalle.get(i.talle) ?? 0) + (i.cantidad ?? 0)));
  const talleHabitual = [...porTalle.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const telefonoWa = c.telefono?.replace(/\D/g, "");

  return (
    <div className="space-y-5">
      <div><Volver href="/admin/clientes">Clientes</Volver>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold"><span className="mr-2 font-mono text-lg text-texto-2">{c.codigo}</span>{c.nombre}</h1>
          {c.usuario_id && <span className="chip bg-blue-50 text-marca">tiene cuenta en la tienda</span>}
          {telefonoWa && <a href={`https://wa.me/549${telefonoWa.replace(/^0/, "")}`} target="_blank" className="boton-sec py-1.5"><MessageCircle size={16} /> WhatsApp</a>}
          {permisos.includes("clientes.editar") && <Link href={`?editar=datos#datos-cliente`} className="boton-sec py-1.5"><Pencil size={16} /> Editar datos</Link>}
        </div></div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Total comprado</div><div className="text-xl font-bold">{pesos(total)}</div></div>
        <div className="tarjeta"><div className="etiqueta">Compras</div><div className="text-xl font-bold">{compras}</div></div>
        <div className="tarjeta"><div className="etiqueta">Ticket promedio</div><div className="text-xl font-bold">{compras ? pesos(total / compras) : "—"}</div></div>
        <div className="tarjeta"><div className="etiqueta">Talle habitual</div><div className="text-xl font-bold">{talleHabitual ?? "—"}</div></div>
      </div>
      {(creditos ?? []).length > 0 && (
        <section className="tarjeta space-y-2">
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Saldo a favor</h2><span className="text-xl font-bold text-ok">{pesos(saldo)}</span></div>
          <ul className="divide-y divide-gray-100 text-sm">{(creditos ?? []).map((x) => {
            const vencido = (x.vence ?? "") < hoyAR;
            return <li key={x.id} className={`flex justify-between gap-3 py-2 ${vencido || Number(x.restante) <= 0 ? "text-texto-2" : ""}`}>
              <span>Devolución <Link href={`/admin/devoluciones/${x.devolucion_id}`} className="font-mono text-marca">{x.devolucion}</Link> · {pesos(x.monto)}</span>
              <span className="text-right">{Number(x.restante) <= 0 ? "usado" : vencido ? `venció el ${dia(x.vence)}` : <>quedan <b>{pesos(x.restante)}</b> · vence {dia(x.vence)}</>}</span></li>;
          })}</ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <section className="tarjeta space-y-3">
            <h2 className="font-semibold">Seguimientos</h2>
            <NuevaInteraccion clienteId={c.id} />
            <ul className="divide-y divide-gray-100 text-sm">
              {(interacciones ?? []).map((i) => (
                <li key={i.id} className="py-2.5">
                  <div className="flex justify-between gap-2"><span><b>{i.tipo}</b>{i.canal ? ` · ${i.canal}` : ""}</span><span className="text-xs text-texto-2">{fechaHora(i.fecha)}</span></div>
                  <p>{i.detalle}</p>
                  {i.proxima_accion && (
                    <div className={`mt-1 flex items-center justify-between rounded-md px-2 py-1 text-xs ${i.hecha ? "bg-gray-50 text-texto-2 line-through" : "bg-amber-50 text-alerta"}`}>
                      <span>→ {i.proxima_accion}{i.proxima_fecha ? ` (${fecha(i.proxima_fecha + "T12:00:00")})` : ""}</span>
                      {!i.hecha && <form action={marcarHecha}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="cliente_id" value={c.id} />
                        <button className="inline-flex items-center gap-1 font-semibold text-ok no-underline"><Check size={14} /> Hecho</button></form>}
                    </div>
                  )}
                </li>
              ))}
              {interacciones?.length === 0 && <li className="py-2 text-texto-2">Sin interacciones registradas.</li>}
            </ul>
          </section>

          <section className="tarjeta">
            <h2 className="mb-2 font-semibold">Compras</h2>
            <div className="-mx-4 overflow-x-auto px-4"><table className="tabla"><tbody>
              {(ventas ?? []).map((v) => <tr key={v.id}><td><Link href={`/admin/ventas/${v.id}`} className="font-mono text-marca">{v.comprobante}</Link></td><td>{fecha(v.fecha)}</td><td>{v.canal}</td><td className="text-right font-semibold">{pesos(v.total)}</td></tr>)}
              {ventas?.length === 0 && <tr><td className="text-texto-2">Todavía no compró.</td></tr>}
            </tbody></table></div>
            {(pedidos ?? []).length > 0 && <>
              <h3 className="mb-1 mt-4 text-sm font-semibold">Pedidos</h3>
              <div className="-mx-4 overflow-x-auto px-4"><table className="tabla"><tbody>
                {(pedidos ?? []).map((p) => <tr key={p.id}><td><Link href={`/admin/pedidos/${p.id}`} className="font-mono text-marca">Pedido {p.comprobante}</Link></td><td>{fecha(p.fecha)}</td><td>{p.estado.replace("_", " ")}</td><td className="text-right">{pesos(p.total)}</td></tr>)}
              </tbody></table></div></>}
          </section>
        </div>
        <div><FichaForm key={editar === "datos" ? "editar" : "ver"} c={c as FichaCliente} letraLocal={letraLocal} puedeEditar={permisos.includes("clientes.editar")} iniciarEdicion={editar === "datos"} /></div>
      </div>
    </div>
  );
}
