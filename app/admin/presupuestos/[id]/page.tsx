// Detalle de un presupuesto: es el documento que se le muestra o manda al cliente.
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, pesos, porcentaje } from "@/lib/formato";
import { ESTADOS_PRESUPUESTO, estadoVisible, hasta } from "@/lib/presupuesto";
import { enlaceWhatsApp, mensajePresupuesto } from "@/lib/whatsapp";
import { CircleCheck, MessageCircle } from "lucide-react";
import Volver from "@/components/Volver";
import Acciones from "./Acciones";
import { exigir } from "@/lib/exigir";

export default async function Presupuesto({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ nuevo?: string }>;
}) {
  await exigir("ventas.registrar", "ventas.ver_todas");
  const [{ id }, { nuevo }] = await Promise.all([params, searchParams]);
  const supabase = await crearCliente();
  const [{ data: p }, { data: items }, { data: medios }] = await Promise.all([
    supabase.from("presupuestos").select("*, clientes(id, nombre, telefono), medios_pago(nombre), vendedor:perfiles(nombre), venta:ventas(id, comprobante)").eq("id", Number(id)).single(),
    supabase.from("presupuesto_items").select("id, cantidad, precio_unitario, descuento_promo, promociones(nombre), variantes(talles(nombre), colores(nombre), productos(nombre))").eq("presupuesto_id", Number(id)).order("id"),
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_mostrador", true).order("orden"),
  ]);
  if (!p) notFound();
  const visible = estadoVisible(p.estado, p.valido_hasta);
  const c = p.clientes as unknown as { id: number; nombre: string; telefono: string | null } | null;
  const medio = (p.medios_pago as unknown as { nombre: string } | null)?.nombre ?? null;
  const venta = p.venta as unknown as { id: number; comprobante: string } | null;
  const renglones = (items ?? []).map((i) => {
    const v = i.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } };
    return { cantidad: i.cantidad, precio_unitario: Number(i.precio_unitario), descuento_promo: Number(i.descuento_promo), modelo: v.productos.nombre,
      talle: v.talles.nombre, color: v.colores.nombre, promocion: (i.promociones as { nombre: string } | null)?.nombre ?? null, id: i.id };
  });
  const mensaje = mensajePresupuesto({
    comprobante: p.comprobante!, cliente: c?.nombre ?? null, renglones, subtotal: Number(p.subtotal), descuento_promociones: Number(p.descuento_promociones),
    descuento: Number(p.descuento), ajuste_pct: Number(p.ajuste_pct), ajuste_medio_pago: Number(p.ajuste_medio_pago), total: Number(p.total), medio,
    valido_hasta: hasta(p.valido_hasta), notas: p.notas,
  });
  // Al teléfono del cliente si lo tenemos (solo dígitos; sin código de país, se asume Argentina)
  const digitos = c?.telefono?.replace(/\D/g, "") ?? "";
  const numero = digitos ? (digitos.startsWith("54") ? digitos : `54${digitos.replace(/^0/, "")}`) : null;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {nuevo && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={18} /> Presupuesto guardado. No se descontó stock.</div>}
      <Volver href="/admin/presupuestos">Presupuestos</Volver>

      <div className="tarjeta space-y-4">
        <div className="flex justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-texto-2">Presupuesto</p>
            <h1 className="text-xl font-bold"><span className="font-mono">{p.comprobante}</span></h1>
            <p className="text-sm text-texto-2">{fecha(p.fecha)}{p.vendedor ? ` · ${(p.vendedor as { nombre: string | null }).nombre ?? "—"}` : ""} · {p.canal}</p>
          </div>
          <div className="text-right text-sm">
            <span className={`chip ${ESTADOS_PRESUPUESTO[visible].color}`}>{ESTADOS_PRESUPUESTO[visible].texto}</span>
            <div className="mt-1 text-texto-2">Válido hasta el {hasta(p.valido_hasta)}</div>
            <div className="text-texto-2">{c ? <Link href={`/admin/clientes/${c.id}`} className="text-marca">{c.nombre}</Link> : "Sin cliente"}</div>
          </div>
        </div>
        {venta && <p className="rounded-lg bg-marca-suave px-3 py-2 text-sm">Se convirtió en la venta <Link href={`/admin/ventas/${venta.id}`} className="font-mono font-semibold text-marca">{venta.comprobante}</Link>.</p>}

        <table className="tabla">
          <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Subtotal</th></tr></thead>
          <tbody>{renglones.map((r) => (
            <tr key={r.id}><td>{r.modelo}<div className="text-xs text-texto-2">Talle {r.talle} · {r.color}</div>
              {r.descuento_promo > 0 && <div className="text-xs font-semibold text-ok">{r.promocion ?? "Promo"}: −{pesos(r.descuento_promo)}</div>}</td>
              <td className="text-right">{r.cantidad}</td><td className="text-right">{pesos(r.precio_unitario)}</td>
              <td className="text-right">{pesos(r.cantidad * r.precio_unitario - r.descuento_promo)}</td></tr>
          ))}</tbody>
        </table>

        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-texto-2"><span>Subtotal</span><span>{pesos(p.subtotal)}</span></div>
          {Number(p.descuento_promociones) > 0 && <div className="flex justify-between text-ok"><span>Promociones</span><span>−{pesos(p.descuento_promociones)}</span></div>}
          {Number(p.descuento) > 0 && <div className="flex justify-between text-ok"><span>Descuento</span><span>−{pesos(p.descuento)}</span></div>}
          {Number(p.ajuste_medio_pago) !== 0 && <div className={`flex justify-between ${Number(p.ajuste_medio_pago) < 0 ? "text-ok" : "text-alerta"}`}>
            <span>{Number(p.ajuste_medio_pago) < 0 ? "Descuento" : "Recargo"} {medio} ({porcentaje(p.ajuste_pct)})</span>
            <span>{Number(p.ajuste_medio_pago) < 0 ? "−" : "+"}{pesos(Math.abs(Number(p.ajuste_medio_pago)))}</span></div>}
          <div className="flex justify-between border-t border-borde pt-2 text-lg font-bold"><span>Total</span><span>{pesos(p.total)}</span></div>
          <p className="text-xs text-texto-2">{medio ? `Precio con pago en ${medio}.` : "Precio de lista; el medio de pago se define al cobrar."} No reserva stock. Documento sin validez fiscal.</p>
          {p.notas && <p><b>Notas:</b> {p.notas}</p>}
        </div>
      </div>

      <a href={enlaceWhatsApp(numero, mensaje)} target="_blank" rel="noreferrer" className="boton-sec w-full print:hidden"><MessageCircle size={16} /> Mandar por WhatsApp</a>
      {visible === "vigente" && <Acciones id={p.id} medios={medios ?? []} medioPresupuestado={p.medio_pago_id} total={Number(p.total)} />}
      {visible === "vencido" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-alerta">Venció: los precios y promociones ya no se respetan. Hacé uno nuevo con los de hoy.</p>}
    </div>
  );
}
