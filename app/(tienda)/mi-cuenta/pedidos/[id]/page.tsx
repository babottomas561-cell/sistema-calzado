// Seguimiento de un pedido: lo que el cliente ve de su compra.
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, pesos, porcentaje } from "@/lib/formato";
import { ESTADOS } from "@/lib/estados-pedido";
import VaciarCarrito from "@/components/VaciarCarrito";
import Volver from "@/components/Volver";
import { Check, MessageCircle } from "lucide-react";
import { enlaceWhatsApp, mensajePedido } from "@/lib/whatsapp";

const PASOS = { retiro: ["pendiente", "confirmado", "preparado", "listo_retiro", "entregado"], envio: ["pendiente", "confirmado", "preparado", "enviado", "entregado"] };

export default async function SeguimientoPedido({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }> }) {
  const [{ id }, { nuevo }] = await Promise.all([params, searchParams]);
  const supabase = await crearCliente();
  // Si el pedido no es suyo, la base no lo devuelve (Row Level Security) → 404
  const [{ data: p }, { data: items }, { data: historial }, { data: tienda }, { data: ficha }] = await Promise.all([
    supabase.from("pedidos").select("*, medios_pago(nombre)").eq("id", Number(id)).maybeSingle(),
    supabase.from("pedido_items").select("id, cantidad, precio_unitario, descuento_promo, promociones(nombre), variantes(talles(nombre), colores(nombre), productos(nombre))").eq("pedido_id", Number(id)),
    supabase.from("pedido_estados").select("id, estado, fecha, comentario").eq("pedido_id", Number(id)).order("fecha"),
    supabase.from("configuracion_tienda").select("whatsapp, direccion_retiro, horario").single(),
    supabase.from("v_mi_ficha").select("nombre").maybeSingle(),
  ]);
  if (!p) notFound();
  const pasos = PASOS[p.entrega as "retiro" | "envio"];
  type Item = { cantidad: number; precio_unitario: number; descuento_promo: number; promociones: { nombre: string } | null; variantes: { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } } };
  const renglones = ((items ?? []) as unknown as Item[]).map((i) => ({ cantidad: i.cantidad, precio_unitario: Number(i.precio_unitario), descuento_promo: Number(i.descuento_promo),
    modelo: i.variantes.productos.nombre, talle: i.variantes.talles.nombre, color: i.variantes.colores.nombre, promocion: i.promociones?.nombre ?? null }));
  const medio = (p.medios_pago as { nombre: string } | null)?.nombre ?? null;
  // El pedido armado para mandar por WhatsApp (lo que guardó la base, no lo que calculó el navegador)
  const mensaje = mensajePedido({ comprobante: p.comprobante ?? "", cliente: ficha?.nombre ?? null, renglones, subtotal: Number(p.subtotal),
    descuento_promociones: Number(p.descuento_promociones), ajuste_pct: Number(p.ajuste_pct), ajuste_medio_pago: Number(p.ajuste_medio_pago),
    total: Number(p.total), medio, entrega: p.entrega, direccion: p.direccion_envio, notas: p.notas });
  const abierto = !["entregado", "cancelado"].includes(p.estado);
  const actual = pasos.indexOf(p.estado);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {nuevo && <><VaciarCarrito /><div className="rounded-xl border border-green-200 bg-green-50 p-4 text-ok"><b>¡Listo! Te reservamos los pares.</b>{tienda?.whatsapp ? " Ahora mandanos el pedido por WhatsApp para coordinar el pago y la entrega." : " Acá podés seguir su estado."}</div></>}
      {tienda?.whatsapp && abierto && (
        <a href={enlaceWhatsApp(tienda.whatsapp, mensaje)} target="_blank" rel="noopener"
          className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3.5 font-semibold text-white shadow-sm ${nuevo ? "bg-[#1f9d55] text-base" : "bg-[#1f9d55]/90 text-sm"}`}>
          <MessageCircle size={20} /> {nuevo ? "Enviar pedido por WhatsApp" : "Escribinos por WhatsApp sobre este pedido"}
        </a>
      )}
      <Volver href="/mi-cuenta">Mis pedidos</Volver>
      <h1 className="text-2xl font-bold">Pedido <span className="font-mono">{p.comprobante}</span></h1>

      {p.estado === "cancelado" ? <div className="rounded-xl bg-gray-100 p-4 text-texto-2">Este pedido fue cancelado.</div> : (
        <ol className="tarjeta flex justify-between gap-1">
          {pasos.map((s, i) => (
            <li key={s} className="flex flex-1 flex-col items-center text-center text-xs">
              <span className={`mb-1 grid h-7 w-7 place-items-center rounded-full font-bold ${i <= actual ? "bg-marca text-white" : "bg-gray-100 text-texto-2"}`}>{i < actual ? <Check size={15} strokeWidth={3} /> : i + 1}</span>
              <span className={i === actual ? "font-semibold text-marca" : "text-texto-2"}>{ESTADOS[s].texto}</span>
            </li>
          ))}
        </ol>
      )}

      <section className="tarjeta">
        <h2 className="mb-2 font-semibold">Novedades</h2>
        <ul className="space-y-2 text-sm">{[...(historial ?? [])].reverse().map((h) => (
          <li key={h.id}><b>{ESTADOS[h.estado]?.texto ?? h.estado}</b> <span className="text-texto-2">· {fechaHora(h.fecha)}</span>{h.comentario && <div>{h.comentario}</div>}</li>
        ))}</ul>
      </section>

      <section className="tarjeta">
        <table className="tabla"><tbody>{(items ?? []).map((i) => {
          const v = i.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } };
          const promo = Number(i.descuento_promo);
          return <tr key={i.id}><td>{v.productos.nombre}<div className="text-xs text-texto-2">Talle {v.talles.nombre} · {v.colores.nombre} · x{i.cantidad}</div>
            {promo > 0 && <div className="text-xs font-semibold text-ok">{(i.promociones as { nombre: string } | null)?.nombre ?? "Promo"}: −{pesos(promo)}</div>}</td>
            <td className="text-right">{promo > 0 && <div className="text-xs text-texto-2 line-through">{pesos(i.cantidad * Number(i.precio_unitario))}</div>}{pesos(i.cantidad * Number(i.precio_unitario) - promo)}</td></tr>;
        })}</tbody></table>
        {Number(p.ajuste_medio_pago) !== 0 && <div className={`mt-2 flex justify-between text-sm ${Number(p.ajuste_medio_pago) < 0 ? "text-ok" : "text-alerta"}`}>
          <span>{Number(p.ajuste_medio_pago) < 0 ? "Descuento" : "Recargo"} por medio de pago ({porcentaje(p.ajuste_pct)})</span>
          <span>{Number(p.ajuste_medio_pago) < 0 ? "−" : "+"}{pesos(Math.abs(Number(p.ajuste_medio_pago)))}</span></div>}
        <div className="mt-2 flex justify-between font-bold"><span>Total</span><span>{pesos(p.total)}</span></div>
        <div className="mt-2 text-sm text-texto-2">{p.entrega === "envio" ? `Envío a ${p.direccion_envio}` : `Retiro en el local${tienda?.direccion_retiro ? `: ${tienda.direccion_retiro}` : ""}${tienda?.horario ? ` (${tienda.horario})` : ""}`}
          {(p.medios_pago as { nombre: string } | null)?.nombre ? ` · Pago: ${(p.medios_pago as { nombre: string }).nombre}` : ""}</div>
      </section>
    </div>
  );
}
