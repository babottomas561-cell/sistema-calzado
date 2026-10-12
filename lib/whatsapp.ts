// Mensajes de WhatsApp: el pedido de la tienda, armado con lo que guardó la base (precios, promos,
// medio de pago), así lo que lee Lucas es exactamente lo que el cliente confirmó.
import { pesos, porcentaje } from "@/lib/formato";

export type RenglonPedido = { cantidad: number; precio_unitario: number; descuento_promo: number; modelo: string; talle: string; color: string; promocion: string | null };
export type DatosPedido = {
  comprobante: string; cliente: string | null; renglones: RenglonPedido[]; subtotal: number; descuento_promociones: number;
  ajuste_pct: number; ajuste_medio_pago: number; total: number; medio: string | null; entrega: string; direccion: string | null; notas: string | null;
  envio?: number; zona?: string | null;   // costo del envío (aparte de los productos) y su zona
};

export function mensajePedido(p: DatosPedido) {
  const lineas = [
    `¡Hola! ${p.cliente ? `Soy ${p.cliente}. ` : ""}Hice el pedido *${p.comprobante}* en la tienda:`, "",
    ...p.renglones.map((r) => {
      const bruto = r.cantidad * r.precio_unitario;
      return `• ${r.cantidad}× ${r.modelo} — talle ${r.talle}, ${r.color} — ${pesos(bruto - r.descuento_promo)}` +
        (r.descuento_promo > 0 ? ` (${r.promocion ?? "promo"}: −${pesos(r.descuento_promo)})` : "");
    }),
    "",
    ...(p.descuento_promociones > 0 || p.ajuste_medio_pago !== 0 ? [`Subtotal: ${pesos(p.subtotal)}`] : []),
    ...(p.descuento_promociones > 0 ? [`Promociones: −${pesos(p.descuento_promociones)}`] : []),
    ...(p.ajuste_medio_pago !== 0 ? [`${p.ajuste_medio_pago < 0 ? "Descuento" : "Recargo"} ${p.medio ?? ""} (${porcentaje(p.ajuste_pct)}): ${p.ajuste_medio_pago < 0 ? "−" : "+"}${pesos(Math.abs(p.ajuste_medio_pago))}`] : []),
    ...(p.envio ? [`Envío${p.zona ? ` (${p.zona})` : ""}: +${pesos(p.envio)}`] : []),
    `*Total: ${pesos(p.total + (p.envio ?? 0))}*`,
    `Pago: ${p.medio ?? "a convenir"}`,
    `Entrega: ${p.entrega === "envio" ? `envío a ${p.direccion}${p.zona ? ` (${p.zona})` : ""}` : "retiro en el local"}`,
    ...(p.notas ? [`Notas: ${p.notas}`] : []),
    "", "¿Me confirmás? ¡Gracias!",
  ];
  return lineas.join("\n");
}

export const enlaceWhatsApp = (numero: string | null, texto: string) =>
  `https://wa.me/${numero ?? ""}?text=${encodeURIComponent(texto)}`;

export type DatosPresupuesto = {
  comprobante: string; cliente: string | null; renglones: RenglonPedido[]; subtotal: number; descuento_promociones: number; descuento: number;
  ajuste_pct: number; ajuste_medio_pago: number; total: number; medio: string | null; valido_hasta: string; notas: string | null;
};

// El presupuesto para mandarle al cliente: cada prenda con su precio final y todo lo que se descontó
export function mensajePresupuesto(p: DatosPresupuesto) {
  const hayDesglose = p.descuento_promociones > 0 || p.descuento > 0 || p.ajuste_medio_pago !== 0;
  return [
    `¡Hola${p.cliente ? ` ${p.cliente}` : ""}! Te paso el presupuesto *${p.comprobante}*:`, "",
    ...p.renglones.map((r) => {
      const bruto = r.cantidad * r.precio_unitario;
      return `• ${r.cantidad}× ${r.modelo} — talle ${r.talle}, ${r.color} — ${pesos(bruto - r.descuento_promo)}` +
        (r.descuento_promo > 0 ? ` (${r.promocion ?? "promo"}: −${pesos(r.descuento_promo)})` : "");
    }),
    "",
    ...(hayDesglose ? [`Subtotal: ${pesos(p.subtotal)}`] : []),
    ...(p.descuento_promociones > 0 ? [`Promociones: −${pesos(p.descuento_promociones)}`] : []),
    ...(p.descuento > 0 ? [`Descuento: −${pesos(p.descuento)}`] : []),
    ...(p.ajuste_medio_pago !== 0 ? [`${p.ajuste_medio_pago < 0 ? "Descuento" : "Recargo"} ${p.medio ?? ""} (${porcentaje(p.ajuste_pct)}): ${p.ajuste_medio_pago < 0 ? "−" : "+"}${pesos(Math.abs(p.ajuste_medio_pago))}`] : []),
    `*Total: ${pesos(p.total)}*`,
    ...(p.medio ? [`Precio con pago en: ${p.medio}`] : []),
    `Válido hasta el ${p.valido_hasta}. El stock no queda reservado hasta que se confirme.`,
    ...(p.notas ? [`Notas: ${p.notas}`] : []),
    "", "¿Lo confirmamos?",
  ].join("\n");
}
