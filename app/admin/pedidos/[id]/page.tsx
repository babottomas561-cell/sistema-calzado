import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, fechaHora, pesos, porcentaje } from "@/lib/formato";
import { CANCELADO_POR, ESTADOS, MOTIVOS_CANCELACION } from "@/lib/estados-pedido";
import Envio from "./Envio";
import Pago from "./Pago";
import Acciones from "./Acciones";
import Avisos, { type EnvioMail } from "./Avisos";
import { puede } from "@/lib/permisos";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";

const ESTADO_MP: Record<string, string> = { approved: "aprobado", pending: "pendiente", in_process: "en revisión", rejected: "rechazado", refunded: "devuelto", cancelled: "cancelado", charged_back: "contracargo" };

export default async function Pedido({ params }: { params: Promise<{ id: string }> }) {
  const { permisos } = await exigir("pedidos.gestionar");
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: p }, { data: items }, { data: historial }, { data: venta }, { data: hasta }] = await Promise.all([
    supabase.from("pedidos").select("*, clientes(id, nombre, telefono, email), medios_pago(nombre), zonas_envio(nombre)").eq("id", Number(id)).single(),
    supabase.from("pedido_items").select("id, cantidad, precio_unitario, descuento_promo, promociones(nombre), variantes(talles(nombre), colores(nombre), productos(nombre))").eq("pedido_id", Number(id)),
    supabase.from("pedido_estados").select("id, estado, fecha, comentario").eq("pedido_id", Number(id)).order("fecha"),
    supabase.from("ventas").select("id, comprobante").eq("pedido_id", Number(id)).maybeSingle(),
    supabase.rpc("retirar_hasta", { p_pedido: Number(id) }),
  ]);
  const { data: medios } = await supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas, tipo, es_saldo").eq("activo", true).order("orden");
  const medioTipos = new Map((medios ?? []).map((x) => [x.id, x.tipo as string]));
  const [{ data: envio }, { data: tienda }, { data: pagosManuales }] = await Promise.all([
    supabase.from("envios").select("proveedor, costo_real, seguimiento, notas").eq("pedido_id", Number(id)).maybeSingle(),
    supabase.from("configuracion_tienda").select("direccion_retiro, envio_requiere_pago, transferencia_comprobante").single(),
    supabase.from("pedido_pagos").select("id, fecha, monto, referencia, confirmado_en, comprobante_path, medios_pago(nombre, tipo)").eq("pedido_id", Number(id)).order("id"),
  ]);
  const { data: tiendaWa } = await supabase.from("configuracion_tienda").select("wa_notificaciones_pedidos, wa_plantilla_estado").maybeSingle();
  const [{ data: mailInfo }, { data: mailsPedido }] = await Promise.all([
    supabase.rpc("comprobante_mail_disponible"),
    supabase.from("mails_cola").select("id, clave, estado, creado_en, error, para").eq("pedido_id", Number(id)).order("id", { ascending: false }).limit(8),
  ]);
  const { data: pagosOnline } = await supabase.from("pagos_online").select("id, pago_externo, estado, monto, comision, cuotas, medio, creado_en").eq("pedido_id", Number(id)).order("id");
  if (!p) notFound();
  const medio = (p.medios_pago as unknown as { nombre: string }).nombre;
  const c = p.clientes as unknown as { id: number; nombre: string; telefono: string | null; email: string | null };

  return (
    <div className="space-y-4">
      <Volver href="/admin/pedidos">Pedidos</Volver>
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">Pedido <span className="font-mono">{p.comprobante}</span></h1>
        <span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span>
        {venta && <Link href={`/admin/ventas/${venta.id}`} className="text-sm text-marca">→ Venta {venta.comprobante}</Link>}</div>
      {p.estado === "cancelado" && p.motivo_cancelacion && (
        <p className="rounded-lg bg-gray-100 px-3 py-2 text-sm"><b>{MOTIVOS_CANCELACION[p.motivo_cancelacion]}</b>
          <span className="text-texto-2"> · cancelado por {CANCELADO_POR[p.cancelado_por ?? "local"]}</span></p>
      )}
      {hasta && <p className="rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">Se guarda hasta el <b>{fecha(hasta)}</b>. Si no lo retiran, se cancela solo y el stock vuelve a la venta.</p>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="tarjeta">
            <div className="-mx-4 overflow-x-auto px-4"><table className="tabla">
              <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
              <tbody>{(items ?? []).map((i) => {
                const v = i.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } };
                const promo = Number(i.descuento_promo);
                return <tr key={i.id}><td>{v.productos.nombre}<div className="text-xs text-texto-2">Talle {v.talles.nombre} · {v.colores.nombre}</div>
                  {promo > 0 && <div className="text-xs font-semibold text-ok">{(i.promociones as { nombre: string } | null)?.nombre ?? "Promo"}: −{pesos(promo)}</div>}</td>
                  <td className="text-right">{i.cantidad}</td><td className="text-right">{pesos(i.precio_unitario)}</td><td className="text-right">{pesos(i.cantidad * Number(i.precio_unitario) - promo)}</td></tr>;
              })}</tbody>
            </table></div>
            <div className="mt-2 space-y-1 text-sm">
              {(Number(p.ajuste_medio_pago) !== 0 || Number(p.descuento_promociones) > 0) && <div className="flex justify-between text-texto-2"><span>Subtotal</span><span>{pesos(p.subtotal)}</span></div>}
              {Number(p.descuento_promociones) > 0 && <div className="flex justify-between text-ok"><span>Promociones</span><span>−{pesos(p.descuento_promociones)}</span></div>}
              {Number(p.ajuste_medio_pago) !== 0 && <>
                <div className={`flex justify-between ${Number(p.ajuste_medio_pago) < 0 ? "text-ok" : "text-alerta"}`}>
                  <span>{medio} ({porcentaje(p.ajuste_pct)})</span><span>{Number(p.ajuste_medio_pago) < 0 ? "−" : "+"}{pesos(Math.abs(Number(p.ajuste_medio_pago)))}</span></div></>}
              {Number(p.costo_envio) > 0 && <div className="flex justify-between text-texto-2"><span>Envío (aparte de la venta)</span><span>+{pesos(p.costo_envio)}</span></div>}
              <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{pesos(Number(p.total) + Number(p.costo_envio))}</span></div>
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
              <div><b>Pago:</b> {medio}{Number(p.ajuste_pct) ? ` (${porcentaje(p.ajuste_pct)})` : ""}
                {p.pagado_online && <span className="ml-1 rounded bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-ok">Pagado online</span>}</div>
              {(pagosOnline ?? []).map((g) => (
                <div key={g.id} className="text-xs text-texto-2">Mercado Pago n.º {g.pago_externo}: {ESTADO_MP[g.estado] ?? g.estado} · {pesos(g.monto)}
                  {g.cuotas && g.cuotas > 1 ? ` en ${g.cuotas} cuotas` : ""}{Number(g.comision) > 0 ? ` · comisión ${pesos(g.comision)}` : ""}</div>
              ))}
              {p.pagado_online && p.estado !== "cancelado" && <div className="text-xs text-alerta">Si lo cancelás, se le devuelve el pago por Mercado Pago.</div>}
              {p.notas && <div><b>Notas:</b> {p.notas}</div>}
            </div>
          </section>
          <Pago pedido={p.id} aPagar={Number(p.total) + Number(p.costo_envio)} pagadoOnline={p.pagado_online} abierto={!["entregado", "cancelado"].includes(p.estado)}
            exigeParaEnviar={p.entrega === "envio" && !!tienda?.envio_requiere_pago} medios={(medios ?? []).filter((x) => !x.es_saldo).map((x) => ({ id: x.id, nombre: x.nombre, tipo: (medioTipos.get(x.id) ?? "Otro") }))}
            medioPedido={p.medio_pago_id} exigencia={(tienda?.transferencia_comprobante ?? "no") as "no" | "referencia" | "adjunto"} puedeConfirmar={puede(permisos, "pagos.confirmar")}
            pagos={(pagosManuales ?? []).map((x) => { const mp = x.medios_pago as unknown as { nombre: string; tipo: string } | null; return ({ id: x.id, fecha: x.fecha, monto: Number(x.monto), referencia: x.referencia,
              medio: mp?.nombre ?? null, tipo: mp?.tipo ?? null, confirmado: !!x.confirmado_en, comprobante: x.comprobante_path }); })} />
          {p.entrega === "envio" && <Envio local={tienda?.direccion_retiro ?? null} d={{ pedido: p.id, comprobante: p.comprobante ?? "", cliente: c.nombre, telefono: c.telefono,
            direccion: p.direccion_envio, zona: (p.zonas_envio as unknown as { nombre: string } | null)?.nombre ?? null, cobrado: Number(p.costo_envio),
            envio: envio ? { ...envio, costo_real: envio.costo_real == null ? null : Number(envio.costo_real) } : null }} />}
          <Avisos cliente={c.nombre} telefono={c.telefono} email={c.email} estado={p.estado} comprobante={p.comprobante ?? ""} waAuto={!!(tiendaWa?.wa_notificaciones_pedidos && tiendaWa?.wa_plantilla_estado)}
            mensaje={`Hola ${c.nombre.split(" ")[0]}! Te escribimos por tu pedido ${p.comprobante ?? ""}. `} mailListo={!!(mailInfo as { disponible?: boolean } | null)?.disponible} mailMotivo={(mailInfo as { motivo?: string } | null)?.motivo}
            puedeConectar={puede(permisos, "equipo.administrar")} envios={(mailsPedido ?? []) as EnvioMail[]} />
          {ESTADOS[p.estado].siguientes.length > 0 && <Acciones key={p.estado} pedido={p.id} siguientes={ESTADOS[p.estado].siguientes} medios={medios ?? []}
            elegido={{ id: p.medio_pago_id, ajuste_pct: Number(p.ajuste_pct) }} subtotal={Number(p.subtotal)} />}
        </div>
      </div>
    </div>
  );
}
