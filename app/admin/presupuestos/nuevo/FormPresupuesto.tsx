"use client";
import { useActionState, useEffect, useState } from "react";
import { BadgePercent, X } from "lucide-react";
import SelectorVariantes, { type FilaStock } from "@/components/SelectorVariantes";
import { pesos, porcentaje } from "@/lib/formato";
import { ajusteDe, textoMedio, type MedioPago } from "@/lib/medios";
import { cotizarPresupuesto, crearPresupuesto, type CotizacionPresupuesto } from "../acciones";

type Item = FilaStock & { cantidad: number; precio: number };
const CANALES = ["Local", "Instagram", "WhatsApp", "Web"];

export default function FormPresupuesto({ filas, clientes, medios, cambiaPrecio, descuentoMax }: {
  filas: FilaStock[]; clientes: { id: number; nombre: string }[]; medios: MedioPago[]; cambiaPrecio: boolean; descuentoMax: number | null;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [canal, setCanal] = useState("Local");
  const [cliente, setCliente] = useState("");
  const [medioId, setMedioId] = useState("");
  const [descuento, setDescuento] = useState(0);
  const [validez, setValidez] = useState(7);
  const [notas, setNotas] = useState("");
  const [estado, accion, cargando] = useActionState(crearPresupuesto, {});

  // Igual que en la caja: solo se ofrece lo que hay (regla 7), así el presupuesto siempre se puede convertir en venta
  const agregar = (f: FilaStock) => setItems((prev) =>
    prev.some((i) => i.variante_id === f.variante_id)
      ? prev.map((i) => i.variante_id === f.variante_id ? { ...i, cantidad: Math.min(i.cantidad + 1, f.stock) } : i)
      : [...prev, { ...f, cantidad: 1, precio: Number(f.precio_venta) }]);
  const cambiar = (id: number, campo: "cantidad" | "precio", valor: number) =>
    setItems((prev) => prev.map((i) => i.variante_id === id ? { ...i, [campo]: valor } : i));

  // Promociones: las calcula la base (las mismas que va a congelar crear_presupuesto)
  const [ultima, setCot] = useState<CotizacionPresupuesto | null>(null);
  const clave = JSON.stringify(items.map((i) => [i.variante_id, i.cantidad, i.precio]));
  useEffect(() => {
    if (!items.length) return;
    let vigente = true;
    const t = setTimeout(async () => { const r = await cotizarPresupuesto(items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio }))); if (vigente) setCot(r); }, 200);
    return () => { vigente = false; clearTimeout(t); };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps
  const cot = items.length ? ultima : null;
  const promoDe = (id: number) => (cot?.renglones ?? []).filter((r) => r.variante_id === id && r.descuento_promo > 0);

  const medio = medios.find((m) => String(m.id) === medioId);
  const subtotal = items.reduce((s, i) => s + i.cantidad * i.precio, 0);
  const promos = cot?.descuento_promociones ?? 0;
  const acumulable = (cot?.renglones ?? []).reduce((s, r) => s + (r.acumula ? r.total : 0), 0);
  const factor = cot && subtotal - promos > 0 ? acumulable / (subtotal - promos) : 1;
  const neto = Math.max(subtotal - promos - descuento, 0);
  const ajuste = medio ? ajusteDe(neto * factor, medio.ajuste_pct) : 0;
  const total = neto + ajuste;
  const topeDescuento = descuentoMax === null ? null : Math.floor(((subtotal - promos) * descuentoMax) / 100);
  const pasaTope = topeDescuento !== null && descuento > topeDescuento;

  const presupuesto = JSON.stringify({
    items: items.map((i) => ({ variante_id: i.variante_id, cantidad: i.cantidad, precio_unitario: i.precio })),
    canal, cliente_id: cliente ? Number(cliente) : null, medio_pago_id: medioId ? Number(medioId) : null, descuento, validez, notas,
  });

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
      <section className="space-y-3">
        <h1 className="text-2xl font-bold">Nuevo presupuesto</h1>
        <p className="text-sm text-texto-2">No descuenta ni reserva stock. Los precios y las promociones quedan congelados hasta el vencimiento.</p>
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
                {promoDe(i.variante_id).map((r) => <div key={r.promocion} className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-ok"><BadgePercent size={13} /> {r.promocion}: −{pesos(r.descuento_promo)}</div>)}
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <label className="text-xs text-texto-2">Cantidad (hay {i.stock})
                    <input type="number" min={1} max={i.stock} value={i.cantidad} className="campo mt-0.5 py-1.5"
                      onChange={(e) => cambiar(i.variante_id, "cantidad", Math.min(Math.max(1, Number(e.target.value)), i.stock))} /></label>
                  <label className="text-xs text-texto-2">Precio c/u
                    <input type="number" min={0} value={i.precio} className="campo mt-0.5 py-1.5 disabled:bg-gray-50" disabled={!cambiaPrecio}
                      onChange={(e) => cambiar(i.variante_id, "precio", Math.max(0, Number(e.target.value)))} /></label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div><label className="etiqueta">Cliente</label>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)} className="campo">
              <option value="">Sin cliente</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
          <div><label className="etiqueta">Canal</label>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className="campo">{CANALES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="col-span-2"><label className="etiqueta">Precio con pago en</label>
            <select value={medioId} onChange={(e) => setMedioId(e.target.value)} className="campo">
              <option value="">A definir al cobrar (precio de lista)</option>{medios.map((m) => <option key={m.id} value={m.id}>{textoMedio(m)}</option>)}</select></div>
          <div><label className="etiqueta">Descuento ($)</label>
            <input type="number" min={0} value={descuento} onChange={(e) => setDescuento(Math.max(0, Number(e.target.value)))} className={`campo ${pasaTope ? "border-error" : ""}`} />
            {topeDescuento !== null && <p className={`mt-0.5 text-[11px] ${pasaTope ? "font-semibold text-error" : "text-texto-2"}`}>Tu tope es {descuentoMax} % ({pesos(topeDescuento)})</p>}</div>
          <div><label className="etiqueta">Válido por (días)</label>
            <input type="number" min={1} max={90} value={validez} onChange={(e) => setValidez(Math.min(90, Math.max(1, Number(e.target.value))))} className="campo" /></div>
          <div className="col-span-2"><label className="etiqueta">Notas (las ve el cliente)</label>
            <input value={notas} onChange={(e) => setNotas(e.target.value)} className="campo" placeholder="Ej: te lo guardamos hasta el viernes" /></div>
        </div>

        <dl className="space-y-1 border-t border-borde pt-3 text-sm">
          <div className="flex justify-between text-texto-2"><dt>Subtotal</dt><dd>{pesos(subtotal)}</dd></div>
          {promos > 0 && <div className="flex justify-between text-ok"><dt>Promociones</dt><dd>−{pesos(promos)}</dd></div>}
          {descuento > 0 && <div className="flex justify-between text-texto-2"><dt>Descuento</dt><dd>−{pesos(descuento)}</dd></div>}
          {ajuste !== 0 && medio && <div className="flex justify-between text-texto-2"><dt>{ajuste < 0 ? "Descuento" : "Recargo"} {medio.nombre} ({porcentaje(medio.ajuste_pct)})</dt><dd>{ajuste < 0 ? "−" : "+"}{pesos(Math.abs(ajuste))}</dd></div>}
          <div className="flex items-baseline justify-between pt-1"><dt className="font-semibold">Total presupuestado</dt><dd className="text-2xl font-bold">{pesos(total)}</dd></div>
        </dl>

        <input type="hidden" name="presupuesto" value={presupuesto} />
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        <button className="boton w-full py-3 text-base" disabled={cargando || items.length === 0 || descuento > subtotal - promos || pasaTope}>
          {cargando ? "Guardando…" : "Guardar presupuesto"}
        </button>
      </form>
    </div>
  );
}
