"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useCarrito } from "@/lib/carrito";
import { numero, pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, type MedioPago } from "@/lib/medios";
import { confirmarPedido } from "./acciones";
import { Footprints, Trash2 } from "lucide-react";

export default function Carrito({ medios }: { medios: MedioPago[] }) {
  const { items, total, cambiar, quitar } = useCarrito();
  const [entrega, setEntrega] = useState("retiro");
  const [medioId, setMedioId] = useState(medios[0]?.id);
  const medio = medios.find((m) => m.id === medioId);
  // Lo mismo que calcula la base en crear_pedido (el precio final lo fija ella)
  const ajuste = medio ? ajusteDe(total, medio.ajuste_pct) : 0;
  // Si sale bien, la acción redirige al seguimiento del pedido (que vacía el carrito)
  const [estado, accion, cargando] = useActionState(confirmarPedido, {});

  if (items.length === 0) return (
    <div className="py-16 text-center"><p className="text-lg">Tu carrito está vacío.</p><Link href="/" className="boton mt-4">Ver el catálogo</Link></div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Tu carrito</h1>
        {items.map((i) => (
          <div key={i.variante_id} className="flex items-center gap-3 rounded-xl border border-borde bg-white p-3">
            <div className="grid h-16 w-16 place-items-center rounded-lg bg-gray-100 text-gray-300"><Footprints size={28} /></div>
            <div className="flex-1"><Link href={`/producto/${i.producto_id}`} className="font-semibold hover:text-marca">{i.nombre}</Link>
              <div className="text-sm text-texto-2">Talle {i.talle} · {i.color}</div><div className="font-semibold">{pesos(i.precio)}</div></div>
            <input type="number" min={1} max={i.disponible} value={i.cantidad} onChange={(e) => cambiar(i.variante_id, Number(e.target.value))} className="campo w-16" aria-label="Cantidad" />
            <button onClick={() => quitar(i.variante_id)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-error" aria-label="Quitar"><Trash2 size={16} /></button>
          </div>
        ))}
      </section>
      <form action={accion} className="tarjeta h-fit space-y-4">
        <h2 className="font-semibold">Confirmar pedido</h2>
        <input type="hidden" name="items" value={JSON.stringify(items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad })))} />
        <div><div className="etiqueta">Entrega</div>
          <div className="grid grid-cols-2 gap-2">{[["retiro", "Retiro en el local"], ["envio", "Envío a domicilio"]].map(([v, t]) => (
            <label key={v} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${entrega === v ? "border-marca bg-marca-suave font-semibold" : "border-borde"}`}>
              <input type="radio" name="entrega" value={v} checked={entrega === v} onChange={() => setEntrega(v)} className="sr-only" />{t}</label>
          ))}</div></div>
        {entrega === "envio" && <div><label className="etiqueta">Dirección de envío</label><input name="direccion" required className="campo" placeholder="Calle, número, ciudad" /></div>}
        <div><div className="etiqueta">Forma de pago</div>
          <div className="space-y-2">{medios.map((m) => (
            <label key={m.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm ${medioId === m.id ? "border-marca bg-marca-suave font-semibold" : "border-borde"}`}>
              <span><input type="radio" name="medio_pago_id" value={m.id} checked={medioId === m.id} onChange={() => setMedioId(m.id)} className="sr-only" />{m.nombre}</span>
              {Number(m.ajuste_pct) !== 0 && <span className={`chip ${Number(m.ajuste_pct) < 0 ? "bg-green-100 text-ok" : "bg-amber-100 text-alerta"}`}>
                {Number(m.ajuste_pct) < 0 ? `${numero(-m.ajuste_pct)} % off` : `recargo ${porcentaje(m.ajuste_pct)}`}</span>}
            </label>
          ))}</div></div>
        <div><label className="etiqueta">Notas</label><input name="notas" className="campo" placeholder="Algo que tengamos que saber" /></div>
        <dl className="space-y-1 border-t border-borde pt-3 text-sm">
          {ajuste !== 0 && <>
            <div className="flex justify-between text-texto-2"><dt>Subtotal</dt><dd>{pesos(total)}</dd></div>
            <div className={`flex justify-between ${ajuste < 0 ? "text-ok" : "text-alerta"}`}><dt>{ajuste < 0 ? "Descuento" : "Recargo"} pagando con {medio?.nombre}</dt>
              <dd>{ajuste < 0 ? "−" : "+"}{pesos(Math.abs(ajuste))}</dd></div></>}
          <div className="flex items-baseline justify-between"><dt className="font-semibold">Total</dt><dd className="text-2xl font-bold">{pesos(total + ajuste)}</dd></div>
        </dl>
        {estado.error && <p className="text-sm text-error">{estado.error}{estado.necesitaIngresar && <> <Link href="/ingresar?volver=/carrito" className="font-semibold text-marca">Ingresar</Link> o <Link href="/registro?volver=/carrito" className="font-semibold text-marca">crear una cuenta</Link></>}</p>}
        <button className="boton w-full py-3" disabled={cargando || !medio}>{cargando ? "Enviando…" : "Confirmar pedido"}</button>
        <p className="text-xs text-texto-2">Te reservamos los pares al confirmar. Te avisamos por acá cuando esté listo.</p>
      </form>
    </div>
  );
}
