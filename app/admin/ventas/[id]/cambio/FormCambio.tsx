"use client";
// El cambio en una pantalla: qué trae, qué se lleva (primero, el mismo modelo en otro talle o color, a un
// toque) y cómo queda la cuenta. La base calcula todo: lo del mismo artículo vale lo que trae, lo demás va
// al precio de hoy, y la diferencia se paga o queda como saldo a favor.
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeftRight, CircleAlert, Minus, Plus, X } from "lucide-react";
import SelectorVariantes, { type FilaStock } from "@/components/SelectorVariantes";
import { dia, pesos } from "@/lib/formato";
import { MOTIVOS_DEVOLUCION } from "@/lib/devoluciones";
import { textoMedio, type MedioPago } from "@/lib/medios";
import { cotizarCambio, registrarCambio, type CotizacionCambio, type Lleva, type Renglon } from "../../../devoluciones/acciones";

type Fila = { id: number; producto_id: number; nombre: string; talle: string; color: string; precio: number; promocion: string | null; quedan: number };

function Cantidad({ valor, max, cambiar }: { valor: number; max: number; cambiar: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center rounded-lg border border-borde">
      <button type="button" aria-label="Uno menos" disabled={valor === 0} onClick={() => cambiar(valor - 1)} className="grid h-10 w-10 place-items-center disabled:opacity-30"><Minus size={16} /></button>
      <span className="w-8 text-center font-semibold tabular-nums">{valor}</span>
      <button type="button" aria-label="Uno más" disabled={valor >= max} onClick={() => cambiar(valor + 1)} className="grid h-10 w-10 place-items-center disabled:opacity-30"><Plus size={16} /></button>
    </div>
  );
}

export default function FormCambio({ venta, renglones, filas, medios, clientes, conCliente, diasCambio, excepcion }: {
  venta: number; renglones: Fila[]; filas: FilaStock[]; medios: MedioPago[]; clientes: { id: number; nombre: string }[];
  conCliente: boolean; diasCambio: number; excepcion: boolean;
}) {
  const [trae, setTrae] = useState<Renglon[]>(renglones.map((r) => ({ venta_item_id: r.id, cantidad: renglones.length === 1 && r.quedan === 1 ? 1 : 0, estado: "bueno" })));
  const [lleva, setLleva] = useState<Lleva[]>([]);
  const [medio, setMedio] = useState<number | null>(medios[0]?.id ?? null);
  const [motivo, setMotivo] = useState("talle");
  const [cot, setCot] = useState<{ error?: string; cotizacion?: CotizacionCambio }>({});
  const [calculando, empezar] = useTransition();
  const [estado, accion, guardando] = useActionState(registrarCambio, {});
  const fila = (id: number) => filas.find((f) => f.variante_id === id);
  const sumar = (f: FilaStock) => setLleva((l) => l.some((x) => x.variante_id === f.variante_id)
    ? l.map((x) => (x.variante_id === f.variante_id ? { ...x, cantidad: Math.min(x.cantidad + 1, f.stock) } : x))
    : [...l, { variante_id: f.variante_id, cantidad: 1 }]);

  // El mismo modelo de lo que trae, en los talles y colores que hay
  const mismos = useMemo(() => {
    const prods = new Set(renglones.filter((r, i) => trae[i].cantidad > 0).map((r) => r.producto_id));
    return filas.filter((f) => prods.has(f.producto_id) && f.stock > 0);
  }, [renglones, trae, filas]);

  const trajo = trae.reduce((s, i) => s + i.cantidad, 0), lleva_n = lleva.reduce((s, i) => s + i.cantidad, 0);
  useEffect(() => {
    if (!trajo || !lleva_n) return;
    const t = setTimeout(() => empezar(async () => setCot(await cotizarCambio(venta, trae, lleva, medio))), 250);
    return () => clearTimeout(t);
  }, [trae, lleva, medio, venta, trajo, lleva_n]);
  const c = trajo && lleva_n ? cot.cotizacion : undefined;
  const bloqueado = c?.fuera_de_plazo && !excepcion;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="venta_id" value={venta} />
      <input type="hidden" name="trae" value={JSON.stringify(trae)} />
      <input type="hidden" name="lleva" value={JSON.stringify(lleva)} />
      <input type="hidden" name="motivo" value={motivo} />
      {medio && c && c.diferencia > 0 && <input type="hidden" name="medio_pago_id" value={medio} />}

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Trae</h2>
        <ul className="divide-y divide-gray-100">{renglones.map((r, i) => (
          <li key={r.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm"><p className="font-semibold">{r.nombre}</p>
                <p className="text-texto-2">Talle {r.talle} · {r.color} · {pesos(r.precio)}{r.promocion ? ` · ${r.promocion}` : ""}</p></div>
              <Cantidad valor={trae[i].cantidad} max={r.quedan} cambiar={(n) => setTrae((t) => t.map((x, k) => (k === i ? { ...x, cantidad: n } : x)))} />
            </div>
            {trae[i].cantidad > 0 && <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={trae[i].estado === "fallado"}
                onChange={(e) => { setTrae((t) => t.map((x, k) => (k === i ? { ...x, estado: e.target.checked ? "fallado" : "bueno" } : x))); if (e.target.checked) setMotivo("fallado"); }} />
              Viene fallado (va a la bandeja de fallados)</label>}
          </li>
        ))}</ul>
      </section>

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Se lleva</h2>
        {mismos.length > 0 && <div>
          <p className="etiqueta">El mismo modelo, en otro talle o color <span className="normal-case tracking-normal">(sin diferencia de precio)</span></p>
          <div className="flex flex-wrap gap-1.5">{mismos.map((f) => (
            <button key={f.variante_id} type="button" onClick={() => sumar(f)}
              className="rounded-lg border border-borde px-2.5 py-1.5 text-sm hover:border-marca hover:bg-marca-suave">
              <b>{f.talle}</b> · {f.color} <span className="text-xs text-texto-2">({f.stock})</span></button>
          ))}</div>
        </div>}
        <details className="group" open={mismos.length === 0}>
          <summary className="cursor-pointer text-sm font-semibold text-marca">Otra cosa (va al precio de hoy)</summary>
          <div className="pt-2"><SelectorVariantes filas={filas} alElegir={sumar} soloConStock /></div>
        </details>
        {lleva.length > 0 && <ul className="divide-y divide-gray-100 border-t border-borde pt-1">{lleva.map((l, i) => {
          const f = fila(l.variante_id);
          const linea = c?.lleva.filter((x) => x.variante_id === l.variante_id) ?? [];
          return <li key={l.variante_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0"><p className="font-semibold">{f?.nombre}</p><p className="text-texto-2">Talle {f?.talle} · {f?.color}</p>
              {linea.map((x, k) => <p key={k} className={`text-xs ${x.mismo_articulo ? "font-semibold text-ok" : "text-texto-2"}`}>
                {x.cantidad} × {pesos(x.precio_unitario)}{x.mismo_articulo ? " · vale lo que trae" : Number(x.descuento_promo) > 0 ? ` · promo −${pesos(x.descuento_promo)}` : " · precio de hoy"}</p>)}</div>
            <div className="flex items-center gap-1">
              <Cantidad valor={l.cantidad} max={f?.stock ?? 1} cambiar={(n) => setLleva((x) => n === 0 ? x.filter((_, k) => k !== i) : x.map((y, k) => (k === i ? { ...y, cantidad: n } : y)))} />
              <button type="button" aria-label="Quitar" onClick={() => setLleva((x) => x.filter((_, k) => k !== i))} className="grid h-10 w-8 place-items-center text-gray-400 hover:text-error"><X size={16} /></button>
            </div>
          </li>;
        })}</ul>}
      </section>

      <section className="tarjeta space-y-3">
        <div><label className="etiqueta">Motivo</label>
          <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo">
            {Object.entries(MOTIVOS_DEVOLUCION).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <textarea name="comentario" rows={2} maxLength={300} placeholder={motivo === "otro" ? "Qué pasó (obligatorio)" : "Comentario (opcional)"} className="campo" aria-label="Comentario" />
        {!conCliente && <div><label className="etiqueta">Cliente</label>
          <select name="cliente_id" required defaultValue="" className="campo">
            <option value="" disabled>Elegí el cliente</option>{clientes.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          <p className="mt-0.5 text-[11px] text-texto-2">¿No está? <Link href="/admin/clientes/nuevo" target="_blank" className="text-marca">Cargalo</Link> y volvé.</p></div>}
      </section>

      {/* La cuenta, de la base */}
      <section className={`tarjeta space-y-2 text-sm ${calculando ? "opacity-60" : ""}`} aria-live="polite">
        <h2 className="flex items-center gap-2 font-semibold"><ArrowLeftRight size={17} /> La cuenta</h2>
        {!trajo || !lleva_n ? <p className="text-texto-2">Elegí qué trae y qué se lleva.</p>
          : cot.error ? <p className="text-error">{cot.error}</p>
          : c ? <>
            <div className="flex justify-between"><span>Lo que trae vale</span><span>{pesos(c.credito)}</span></div>
            <div className="flex justify-between"><span>Lo que se lleva</span><span>{pesos(c.total_nuevo)}</span></div>
            {c.diferencia > 0 ? <>
              <div className="flex items-center justify-between gap-3 border-t border-borde pt-2">
                <span>Paga la diferencia con</span>
                <select value={medio ?? ""} onChange={(e) => setMedio(Number(e.target.value))} className="campo w-auto py-1.5">
                  {medios.map((m) => <option key={m.id} value={m.id}>{textoMedio(m)}</option>)}</select></div>
              {c.ajuste_medio !== 0 && <div className="flex justify-between text-texto-2"><span>{c.ajuste_medio < 0 ? "Descuento" : "Recargo"} sobre la diferencia</span><span>{pesos(c.ajuste_medio)}</span></div>}
              <div className="flex justify-between text-lg font-bold"><span>A cobrar</span><span>{pesos(c.a_pagar)}</span></div>
            </> : c.queda_saldo > 0
              ? <p className="border-t border-borde pt-2">No paga nada y le quedan <b>{pesos(c.queda_saldo)}</b> de saldo a favor (hasta el {dia(c.vence_saldo)}).</p>
              : <p className="border-t border-borde pt-2 font-semibold text-ok">Sin diferencia: no paga nada.</p>}
          </> : null}
      </section>
      {c?.fuera_de_plazo && (
        <p className={`flex gap-2 rounded-lg px-3 py-2 text-sm ${bloqueado ? "bg-red-50 text-error" : "bg-amber-50 text-alerta"}`}>
          <CircleAlert size={17} className="mt-0.5 shrink-0" />
          {bloqueado ? `Pasó el plazo de cambios (${diasCambio} días, hasta el ${dia(c.limite)}). Solo lo puede aceptar el encargado.`
            : `Pasó el plazo de cambios (hasta el ${dia(c.limite)}). Lo aceptás como excepción.`}</p>
      )}
      {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
      <button className="boton w-full" disabled={guardando || !c || !!cot.error || bloqueado}>
        {guardando ? "Registrando…" : c ? (c.a_pagar > 0 ? `Hacer el cambio · cobrar ${pesos(c.a_pagar)}` : "Hacer el cambio") : "Hacer el cambio"}</button>
    </form>
  );
}
