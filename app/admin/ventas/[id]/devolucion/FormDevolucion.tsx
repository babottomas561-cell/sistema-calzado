"use client";
// Elegir qué vuelve (cuántas de cada renglón y si viene bien o fallado), el motivo y, si la venta no tenía
// cliente, a nombre de quién queda el saldo. Mientras se elige, la base calcula el saldo a favor.
import { useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, Minus, Plus, Wallet } from "lucide-react";
import { dia, pesos } from "@/lib/formato";
import { MOTIVOS_DEVOLUCION } from "@/lib/devoluciones";
import { cotizarDevolucion, registrarDevolucion, type Cotizacion, type Renglon } from "../../../devoluciones/acciones";

type Fila = { id: number; nombre: string; marca: string | null; talle: string; color: string; precio: number; promocion: string | null; quedan: number };

export default function FormDevolucion({ venta, renglones, clientes, conCliente, diasCambio, excepcion }: {
  venta: number; renglones: Fila[]; clientes: { id: number; nombre: string }[]; conCliente: boolean; diasCambio: number; excepcion: boolean;
}) {
  const [items, setItems] = useState<Renglon[]>(renglones.map((r) => ({ venta_item_id: r.id, cantidad: 0, estado: "bueno" })));
  const [motivo, setMotivo] = useState("");
  const [cot, setCot] = useState<{ error?: string; cotizacion?: Cotizacion }>({});
  const [calculando, empezar] = useTransition();
  const [estado, accion, guardando] = useActionState(registrarDevolucion, {});
  const cambiar = (i: number, x: Partial<Renglon>) => {
    setItems((it) => it.map((r, k) => (k === i ? { ...r, ...x } : r)));
    // Si algo vuelve fallado, el motivo más probable es "vino fallado"
    if (x.estado === "fallado" && !motivo) setMotivo("fallado");
  };
  const elegidas = items.reduce((s, i) => s + i.cantidad, 0);

  // La cuenta la hace la base (promociones por grupo, descuentos, sin recargo de cuotas)
  useEffect(() => {
    const t = setTimeout(() => empezar(async () => setCot(elegidas ? await cotizarDevolucion(venta, items) : {})), 250);
    return () => clearTimeout(t);
  }, [items, venta, elegidas]);

  const c = cot.cotizacion;
  const bloqueado = c?.fuera_de_plazo && !excepcion;
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="venta_id" value={venta} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">¿Qué devuelve?</h2>
        <ul className="divide-y divide-gray-100">
          {renglones.map((r, i) => (
            <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm"><p className="font-semibold">{r.nombre}</p>
                  <p className="text-texto-2">Talle {r.talle} · {r.color} · {pesos(r.precio)}{r.promocion ? ` · ${r.promocion}` : ""}</p>
                  <p className="text-xs text-texto-2">Quedan {r.quedan} por devolver</p></div>
                <div className="flex shrink-0 items-center rounded-lg border border-borde">
                  <button type="button" aria-label="Uno menos" disabled={items[i].cantidad === 0} onClick={() => cambiar(i, { cantidad: items[i].cantidad - 1 })}
                    className="grid h-10 w-10 place-items-center disabled:opacity-30"><Minus size={16} /></button>
                  <span className="w-8 text-center font-semibold tabular-nums">{items[i].cantidad}</span>
                  <button type="button" aria-label="Uno más" disabled={items[i].cantidad >= r.quedan} onClick={() => cambiar(i, { cantidad: items[i].cantidad + 1 })}
                    className="grid h-10 w-10 place-items-center disabled:opacity-30"><Plus size={16} /></button>
                </div>
              </div>
              {items[i].cantidad > 0 && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {(["bueno", "fallado"] as const).map((e) => (
                    <button key={e} type="button" onClick={() => cambiar(i, { estado: e })} aria-pressed={items[i].estado === e}
                      className={`rounded-lg border px-3 py-2 ${items[i].estado === e ? (e === "fallado" ? "border-alerta bg-amber-50 font-semibold text-alerta" : "border-marca bg-marca-suave font-semibold text-marca") : "border-borde"}`}>
                      {e === "bueno" ? "Viene bien: vuelve a la venta" : "Viene fallado: a la bandeja"}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="tarjeta space-y-3">
        <fieldset className="space-y-1.5">
          <legend className="etiqueta">Motivo</legend>
          {Object.entries(MOTIVOS_DEVOLUCION).map(([valor, texto]) => (
            <label key={valor} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-borde px-3 py-2.5 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
              <input type="radio" name="motivo" value={valor} required checked={motivo === valor} onChange={() => setMotivo(valor)} /> {texto}</label>
          ))}
        </fieldset>
        <textarea name="comentario" rows={2} maxLength={300} placeholder={motivo === "fallado" ? "Qué tiene (costura, suela, mancha…)" : "Comentario (obligatorio si es «otro»)"} className="campo" aria-label="Comentario" />
        {!conCliente && (
          <div><label className="etiqueta">Cliente (el saldo a favor queda a su nombre)</label>
            <select name="cliente_id" required defaultValue="" className="campo">
              <option value="" disabled>Elegí el cliente</option>{clientes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}
            </select>
            <p className="mt-0.5 text-[11px] text-texto-2">¿No está? <Link href="/admin/clientes/nuevo" target="_blank" className="text-marca">Cargalo</Link> y volvé a esta pantalla.</p></div>
        )}
      </section>

      {/* El saldo, calculado por la base */}
      <section className={`tarjeta flex items-start gap-3 ${calculando ? "opacity-60" : ""}`} aria-live="polite">
        <Wallet size={22} className="mt-0.5 shrink-0 text-marca" />
        {!elegidas ? <p className="text-sm text-texto-2">Elegí qué devuelve para ver el saldo a favor que le queda.</p>
          : cot.error ? <p className="text-sm text-error">{cot.error}</p>
          : c ? <div className="text-sm">
              <p>Le queda <b className="text-lg">{pesos(c.total)}</b> de saldo a favor, para usar hasta el <b>{dia(c.vence_saldo)}</b>.</p>
              {c.total < c.bruto && <p className="text-xs text-texto-2">Es lo que pagó de verdad: con su parte del descuento (y sin el recargo de las cuotas, si pagó así).</p>}
              {Number(c.total) === 0 && <p className="text-xs text-texto-2">Lo que se queda vale lo mismo que pagó (por ejemplo, devuelve uno de un 2×1): no queda saldo.</p>}
            </div> : null}
      </section>
      {c?.fuera_de_plazo && (
        <p className={`flex gap-2 rounded-lg px-3 py-2 text-sm ${bloqueado ? "bg-red-50 text-error" : "bg-amber-50 text-alerta"}`}>
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {bloqueado ? `Pasó el plazo de cambios (${diasCambio} días, hasta el ${dia(c.limite)}). Solo la puede aceptar el encargado.`
            : `Pasó el plazo de cambios (hasta el ${dia(c.limite)}). La aceptás como excepción.`}</p>
      )}
      {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
      <button className="boton w-full" disabled={guardando || !elegidas || !!cot.error || bloqueado}>
        {guardando ? "Registrando…" : c ? `Registrar devolución · saldo ${pesos(c.total)}` : "Registrar devolución"}</button>
    </form>
  );
}
