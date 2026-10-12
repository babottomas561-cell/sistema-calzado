"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useCarrito } from "@/lib/carrito";
import { numero, pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, type MedioPago } from "@/lib/medios";
import { confirmarPedido, cotizarCarrito, type Cotizacion } from "./acciones";
import { BadgePercent, Minus, Plus, Shirt, MessageCircle, Trash2 } from "lucide-react";

export default function Carrito({ medios, conWhatsApp }: { medios: MedioPago[]; conWhatsApp: boolean }) {
  const { items, cargado, total, cambiar, quitar } = useCarrito();
  const [entrega, setEntrega] = useState("retiro");
  const [medioId, setMedioId] = useState(medios[0]?.id);
  const medio = medios.find((m) => m.id === medioId);
  // El total lo calcula la base (cotizar: precios, promociones y % del medio), igual que crear_pedido.
  // Mientras llega, se muestra una estimación sin promociones.
  const [cot, setCot] = useState<Cotizacion | null>(null);
  const clave = JSON.stringify([items.map((i) => [i.variante_id, i.cantidad]), medioId]);
  useEffect(() => {
    if (!items.length) return;
    let vigente = true;
    const t = setTimeout(async () => { const r = await cotizarCarrito(items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })), medioId ?? null); if (vigente) setCot(r); }, 200);
    return () => { vigente = false; clearTimeout(t); };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const promoDe = (varianteId: number) => (cot?.renglones ?? []).filter((r) => r.variante_id === varianteId && r.descuento_promo > 0);
  const subtotal = cot?.subtotal ?? total;
  const promos = cot?.descuento_promociones ?? 0;
  const ajuste = cot ? cot.ajuste_medio_pago : medio ? ajusteDe(total, medio.ajuste_pct) : 0;
  const totalFinal = cot ? cot.total : total + ajuste;
  // Si sale bien, la acción redirige al seguimiento del pedido (que vacía el carrito)
  const [estado, accion, cargando] = useActionState(confirmarPedido, {});

  if (!cargado) return <div className="py-16" aria-busy="true" />;
  if (items.length === 0) return (
    <div className="mx-auto max-w-sm py-20 text-center"><p className="text-2xl font-extrabold tracking-tight">Tu carrito está vacío</p><p className="mt-2 text-texto-2">Elegí algo que te guste y reservalo para retirarlo o recibirlo.</p><Link href="/" className="boton mt-6">Ver el catálogo</Link></div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-[-0.035em]">Tu carrito <span className="text-xl font-semibold text-texto-2">({items.reduce((s, i) => s + i.cantidad, 0)})</span></h1>
        <ul className="divide-y divide-borde border-y border-borde">
        {items.map((i) => (
          <li key={i.variante_id} className="flex gap-4 py-5">
            <Link href={`/producto/${i.producto_id}`} className="grid h-28 w-[5.5rem] shrink-0 place-items-center overflow-hidden rounded-sm bg-marca-suave text-gray-300" aria-label={i.nombre}>
              {i.imagen_url ? <img src={i.imagen_url} alt="" className="h-full w-full object-cover object-top" /> : <Shirt size={30} strokeWidth={1.4} />}</Link>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><Link href={`/producto/${i.producto_id}`} className="line-clamp-2 font-semibold leading-snug hover:underline hover:underline-offset-4">{i.nombre}</Link>
                  <p className="mt-0.5 text-sm text-texto-2">Talle {i.talle} · {i.color}</p></div>
                <p className="shrink-0 font-bold">{pesos(i.precio * i.cantidad)}</p>
              </div>
              {promoDe(i.variante_id).map((r) => <p key={r.promocion} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-acento"><BadgePercent size={14} /> {r.promocion}: −{pesos(r.descuento_promo)}</p>)}
              <div className="mt-auto flex items-center justify-between pt-3">
                <div className="inline-flex items-center rounded-sm border border-gray-300" role="group" aria-label={`Cantidad de ${i.nombre}`}>
                  <button onClick={() => cambiar(i.variante_id, i.cantidad - 1)} disabled={i.cantidad <= 1} aria-label="Una menos" className="grid h-11 w-11 place-items-center disabled:opacity-30"><Minus size={16} /></button>
                  <span className="w-8 text-center font-semibold" aria-live="polite">{i.cantidad}</span>
                  <button onClick={() => cambiar(i.variante_id, i.cantidad + 1)} disabled={i.cantidad >= i.disponible} aria-label="Una más" className="grid h-11 w-11 place-items-center disabled:opacity-30"><Plus size={16} /></button>
                </div>
                <button onClick={() => quitar(i.variante_id)} className="inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-semibold text-texto-2 hover:text-error"><Trash2 size={16} /> Quitar</button>
              </div>
            </div>
          </li>
        ))}
        </ul>
        {/* "Te falta 1 unidad para el 2×1" */}
        {(cot?.sugerencias ?? []).map((g) => (
          <p key={g.promocion} className="flex items-center gap-2 rounded-sm bg-acento-suave px-4 py-3 text-sm">
            <BadgePercent size={18} className="shrink-0 text-acento" /> <span>Sumá <b>{g.faltan} {g.faltan === 1 ? "unidad" : "unidades"}</b> más y aprovechás <b>{g.promocion}</b>. <Link href="/" className="font-semibold underline">Ver el catálogo</Link></span></p>
        ))}
      </section>
      <form action={accion} className="tarjeta h-fit space-y-5 lg:sticky lg:top-24">
        <h2 className="text-xl font-extrabold tracking-[-0.03em]">Confirmar pedido</h2>
        <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })))} />
        <div><div className="etiqueta">Entrega</div>
          <div className="grid grid-cols-2 gap-2">{[["retiro", "Retiro en el local"], ["envio", "Envío a domicilio"]].map(([v, t]) => (
            <label key={v} className={`flex min-h-12 cursor-pointer items-center justify-center rounded-sm border px-3 text-center text-sm ${entrega === v ? "border-marca bg-marca font-semibold text-white" : "border-gray-300 hover:border-marca"}`}>
              <input type="radio" name="entrega" value={v} checked={entrega === v} onChange={() => setEntrega(v)} className="sr-only" />{t}</label>
          ))}</div></div>
        {entrega === "envio" && <div><label className="etiqueta">Dirección de envío</label><input name="direccion" required className="campo" placeholder="Calle, número, ciudad" /></div>}
        <div><div className="etiqueta">Forma de pago</div>
          <div className="space-y-2">{medios.map((m) => (
            <label key={m.id} className={`flex min-h-12 cursor-pointer items-center justify-between rounded-sm border px-3.5 text-sm ${medioId === m.id ? "border-marca bg-marca-suave font-semibold ring-1 ring-marca" : "border-gray-300 hover:border-marca"}`}>
              <span><input type="radio" name="medio_pago_id" value={m.id} checked={medioId === m.id} onChange={() => setMedioId(m.id)} className="sr-only" />{m.nombre}</span>
              {Number(m.ajuste_pct) !== 0 && <span className={`chip rounded-sm ${Number(m.ajuste_pct) < 0 ? "bg-acento text-white" : "bg-gray-200 text-alerta"}`}>
                {Number(m.ajuste_pct) < 0 ? `${numero(-m.ajuste_pct)} % off` : `recargo ${porcentaje(m.ajuste_pct)}`}</span>}
            </label>
          ))}</div></div>
        <div><label className="etiqueta">Notas</label><input name="notas" className="campo" placeholder="Algo que tengamos que saber" /></div>
        <dl className={`space-y-1 border-t border-borde pt-3 text-sm ${cot ? "" : "opacity-60"}`}>
          {(promos > 0 || ajuste !== 0) && <div className="flex justify-between text-texto-2"><dt>Subtotal</dt><dd>{pesos(subtotal)}</dd></div>}
          {promos > 0 && <div className="flex justify-between text-ok"><dt>Promociones</dt><dd>−{pesos(promos)}</dd></div>}
          {ajuste !== 0 && <div className={`flex justify-between ${ajuste < 0 ? "text-ok" : "text-alerta"}`}><dt>{ajuste < 0 ? "Descuento" : "Recargo"} pagando con {medio?.nombre}</dt>
            <dd>{ajuste < 0 ? "−" : "+"}{pesos(Math.abs(ajuste))}</dd></div>}
          <div className="flex items-baseline justify-between"><dt className="font-semibold">Total</dt><dd className="text-3xl font-extrabold tracking-[-0.03em]">{pesos(totalFinal)}</dd></div>
        </dl>
        {estado.error && <p className="text-sm text-error">{estado.error}{estado.necesitaIngresar && <> <Link href="/ingresar?volver=/carrito" className="font-semibold text-marca">Ingresar</Link> o <Link href="/registro?volver=/carrito" className="font-semibold text-marca">crear una cuenta</Link></>}</p>}
        <button className="boton w-full" disabled={cargando || !medio}>
          {conWhatsApp && <MessageCircle size={18} />}{cargando ? "Enviando…" : conWhatsApp ? "Confirmar y enviar por WhatsApp" : "Confirmar pedido"}</button>
        <p className="text-xs text-texto-2">{conWhatsApp
          ? "Te reservamos los productos y en el paso siguiente nos mandás el pedido por WhatsApp para coordinar el pago y la entrega."
          : "Te reservamos los productos al confirmar. Te avisamos por acá cuando esté listo."}</p>
      </form>
    </div>
  );
}
