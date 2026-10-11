"use client";
import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import SelectorVariantes, { type FilaStock } from "@/components/SelectorVariantes";
import { pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, textoMedio, type MedioPago } from "@/lib/medios";
import { registrarVenta } from "../acciones";

type Item = FilaStock & { cantidad: number; precio: number };
// base = qué parte del precio cubre ese medio (el primero cubre lo que falte)
type Pago = { medio_pago_id: number; base: number };
const CANALES = ["Local", "Instagram", "WhatsApp", "Web"];

export default function PuntoDeVenta({ filas, clientes, medios }: { filas: FilaStock[]; clientes: { id: number; nombre: string }[]; medios: MedioPago[] }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pagos, setPagos] = useState<Pago[]>(medios.length ? [{ medio_pago_id: medios[0].id, base: 0 }] : []);
  const [canal, setCanal] = useState("Local");
  const [cliente, setCliente] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [estado, accion, cargando] = useActionState(registrarVenta, {});
  const medio = (id: number) => medios.find((m) => m.id === id)!;

  const agregar = (f: FilaStock) => setItems((prev) => {
    const ya = prev.find((i) => i.variante_id === f.variante_id);
    if (ya) return prev.map((i) => i.variante_id === f.variante_id ? { ...i, cantidad: Math.min(i.cantidad + 1, f.stock) } : i);
    return [...prev, { ...f, cantidad: 1, precio: Number(f.precio_venta) }];
  });
  const cambiar = (id: number, campo: "cantidad" | "precio", valor: number) =>
    setItems((prev) => prev.map((i) => i.variante_id === id ? { ...i, [campo]: valor } : i));

  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const neto = Math.max(subtotal - descuento, 0);
  // El primer medio completa lo que no cubren los demás
  const otros = pagos.slice(1).reduce((s, p) => s + p.base, 0);
  const lineas = pagos.map((p, i) => {
    const base = i === 0 ? Math.max(neto - otros, 0) : p.base;
    const m = medio(p.medio_pago_id);
    const ajuste = ajusteDe(base, m.ajuste_pct);
    return { ...p, base, ajuste, cobra: base + ajuste, m };
  });
  const ajustes = lineas.reduce((s, l) => s + l.ajuste, 0);
  const total = neto + ajustes;
  const excedido = otros > neto;

  // A la base van primero los montos fijos y al final el que "completa" (sin base: cubre lo que falte)
  const venta = JSON.stringify({
    items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio })),
    pagos: [...lineas.slice(1).filter((l) => l.base > 0).map((l) => ({ medio_pago_id: l.medio_pago_id, base: l.base })),
            ...(lineas[0] ? [{ medio_pago_id: lineas[0].medio_pago_id }] : [])],
    canal, cliente_id: cliente ? Number(cliente) : null, descuento,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Nueva venta</h1>
        <SelectorVariantes filas={filas} alElegir={agregar} soloConStock />
      </section>

      <form action={accion} className="tarjeta h-fit space-y-4 lg:sticky lg:top-6">
        <h2 className="font-semibold">Detalle</h2>
        {items.length === 0 ? <p className="text-sm text-texto-2">Elegí un modelo y un talle para agregarlo.</p> : (
          <ul className="divide-y divide-gray-100">
            {items.map((i) => (
              <li key={i.variante_id} className="py-2 text-sm">
                <div className="flex justify-between gap-2"><span><b>{i.nombre}</b> · {i.talle} · {i.color}</span>
                  <button type="button" onClick={() => setItems((p) => p.filter((x) => x.variante_id !== i.variante_id))} className="text-gray-400 hover:text-error" aria-label="Quitar"><X size={16} /></button></div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="text-xs text-texto-2">Cantidad (hay {i.stock})
                    <input type="number" min={1} max={i.stock} value={i.cantidad} className="campo mt-0.5 py-1.5"
                      onChange={(e) => cambiar(i.variante_id, "cantidad", Math.min(Math.max(1, Number(e.target.value)), i.stock))} /></label>
                  <label className="text-xs text-texto-2">Precio c/u
                    <input type="number" min={0} value={i.precio} className="campo mt-0.5 py-1.5"
                      onChange={(e) => cambiar(i.variante_id, "precio", Math.max(0, Number(e.target.value)))} /></label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="etiqueta">Cliente</label>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo">
              <option value="">Sin cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select></div>
          <div><label className="etiqueta">Canal</label>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="campo">{CANALES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="col-span-2"><label className="etiqueta">Descuento del vendedor ($)</label>
            <input type="number" min={0} value={descuento} onChange={(e) => setDescuento(Math.max(0, Number(e.target.value)))} className="campo" /></div>
        </div>

        <div className="space-y-2">
          <label className="etiqueta">Cobro</label>
          {lineas.map((l, i) => (
            <div key={i} className="rounded-lg border border-borde p-2">
              <div className="flex gap-2">
                <select value={l.medio_pago_id} className="campo py-1.5"
                  onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, medio_pago_id: Number(e.target.value) } : x))}>
                  {medios.map((m) => <option key={m.id} value={m.id}>{textoMedio(m)}</option>)}
                </select>
                {lineas.length > 1 && (i === 0
                  ? <div className="campo w-32 bg-gray-50 py-1.5 text-right" title="Completa lo que falta">{pesos(l.base)}</div>
                  : <input type="number" min={0} value={l.base || ""} placeholder="0" aria-label="Parte del precio" className="campo w-32 py-1.5 text-right"
                      onChange={(e) => setPagos((ps) => ps.map((x, j) => j === i ? { ...x, base: Math.max(0, Number(e.target.value)) } : x))} />)}
                {i > 0 && <button type="button" onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))} className="text-gray-400 hover:text-error" aria-label="Quitar medio"><X size={16} /></button>}
              </div>
              {l.ajuste !== 0 && l.base > 0 && (
                <p className={`mt-1 text-xs ${l.ajuste < 0 ? "text-ok" : "text-alerta"}`}>
                  {l.ajuste < 0 ? "Descuento" : "Recargo"} {porcentaje(l.m.ajuste_pct)}: {pesos(l.ajuste)} → cobra {pesos(l.cobra)}
                  {l.m.cuotas > 1 && ` en ${l.m.cuotas} cuotas de ${pesos(l.cobra / l.m.cuotas)}`}</p>
              )}
            </div>
          ))}
          {medios.length > 0 && <button type="button" onClick={() => setPagos((ps) => [...ps, { medio_pago_id: medios[Math.min(1, medios.length - 1)].id, base: 0 }])}
            className="inline-flex items-center gap-1 text-sm font-semibold text-marca"><Plus size={15} /> Otro medio de pago</button>}
          {excedido && <p className="text-sm text-error">Los montos superan el total.</p>}
        </div>

        <dl className="space-y-1 border-t border-borde pt-3 text-sm">
          <div className="flex justify-between text-texto-2"><dt>Subtotal</dt><dd>{pesos(subtotal)}</dd></div>
          {descuento > 0 && <div className="flex justify-between text-texto-2"><dt>Descuento</dt><dd>−{pesos(descuento)}</dd></div>}
          {ajustes !== 0 && <div className="flex justify-between text-texto-2"><dt>{ajustes < 0 ? "Descuento" : "Recargo"} por medio de pago</dt><dd>{ajustes < 0 ? "−" : "+"}{pesos(Math.abs(ajustes))}</dd></div>}
          <div className="flex items-baseline justify-between pt-1"><dt className="font-semibold">Total a cobrar</dt><dd className="text-2xl font-bold">{pesos(total)}</dd></div>
        </dl>

        <input type="hidden" name="venta" value={venta} />
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        <button className="boton w-full py-3 text-base" disabled={cargando || items.length === 0 || descuento > subtotal || excedido}>
          {cargando ? "Registrando…" : "Confirmar venta"}
        </button>
      </form>
    </div>
  );
}
