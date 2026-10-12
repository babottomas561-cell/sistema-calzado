"use client";
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { arrepentirse } from "./acciones";

export default function Formulario() {
  const [estado, accion, cargando] = useActionState(arrepentirse, {});
  const v = estado.valores ?? {};
  if (estado.codigo) return (
    <div className="tarjeta mx-auto max-w-md space-y-3 p-6 text-center">
      <CircleCheck size={40} className="mx-auto text-ok" />
      <h1 className="text-xl font-bold">Recibimos tu solicitud</h1>
      <p className="text-sm text-texto-2">Guardá este código como constancia. Nos vamos a comunicar con vos al email o teléfono que dejaste para coordinar la devolución.</p>
      <p className="rounded-lg bg-gray-50 px-3 py-3 font-mono text-xl font-bold tracking-wide">{estado.codigo}</p>
      <p className="text-xs text-texto-2">Sacale una captura a esta pantalla. Los gastos de devolución del producto son a cargo del vendedor.</p>
    </div>
  );
  return (
    <form action={accion} className="tarjeta mx-auto max-w-md space-y-4 p-6">
      <div><h1 className="text-xl font-bold">Botón de arrepentimiento</h1>
        <p className="text-sm text-texto-2">Si compraste por internet, podés revocar la compra dentro de los <b>10 días corridos</b> de recibir el producto, sin dar explicaciones.</p></div>
      <div><label className="etiqueta" htmlFor="nombre">Nombre y apellido</label><input id="nombre" name="nombre" required autoComplete="name" defaultValue={v.nombre} className="campo" /></div>
      <div><label className="etiqueta" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" defaultValue={v.email} className="campo" />
        <p className="mt-1 text-xs text-texto-2">El mismo con el que compraste, así podemos encontrar tu pedido.</p></div>
      <div><label className="etiqueta" htmlFor="telefono">Teléfono <span className="font-normal text-texto-2">(opcional)</span></label><input id="telefono" name="telefono" type="tel" autoComplete="tel" defaultValue={v.telefono} className="campo" /></div>
      <div><label className="etiqueta" htmlFor="comprobante">N.º de pedido <span className="font-normal text-texto-2">(opcional)</span></label><input id="comprobante" name="comprobante" defaultValue={v.comprobante} placeholder="Está en tu mail o en Mi cuenta" className="campo" /></div>
      <div><label className="etiqueta" htmlFor="detalle">Qué producto querés devolver <span className="font-normal text-texto-2">(opcional)</span></label><textarea id="detalle" name="detalle" rows={3} maxLength={1000} defaultValue={v.detalle} className="campo" /></div>
      {estado.error && <p className="text-sm text-error" role="alert">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Enviando…" : "Quiero arrepentirme de mi compra"}</button>
    </form>
  );
}
