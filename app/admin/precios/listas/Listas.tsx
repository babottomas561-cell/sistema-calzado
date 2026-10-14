"use client";
// Administración de las listas de precios: encender, qué lista usa cada canal y las listas (nombre, % y redondeo) con un ejemplo en vivo.
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, Plus, Trash2 } from "lucide-react";
import { pesos } from "@/lib/formato";
import { aplicarLista, REDONDEOS } from "@/lib/listas";
import { configurarListas, guardarLista, quitarLista } from "../acciones";

export type Lista = { id: number; nombre: string; ajuste_pct: number; redondeo: number; activa: boolean };
type Estado = { error?: string; ok?: string };
const Mensaje = ({ a }: { a: Estado }) => a.error ? <p className="text-sm text-error" role="alert">{a.error}</p> : a.ok ? <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {a.ok}</p> : null;
const EJEMPLO = 10000;

function FormLista({ l }: { l?: Lista }) {
  const [e, accion, cargando] = useActionState(guardarLista, {});
  const [pct, setPct] = useState(String(l?.ajuste_pct ?? 0));
  const [red, setRed] = useState(l?.redondeo ?? 0);
  const [quitando, quitar] = useTransition();
  const [errQuitar, setErrQuitar] = useState<Estado>({});
  const n = Number(pct.replace(",", ".")) || 0;
  const id = l?.id ?? "nueva";
  return (
    <form action={accion} className={`tarjeta space-y-3 ${l && !l.activa ? "opacity-70" : ""}`}>
      {l && <input type="hidden" name="id" value={l.id} />}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1"><label className="etiqueta" htmlFor={`ln-${id}`}>Nombre</label><input id={`ln-${id}`} name="nombre" defaultValue={l?.nombre ?? ""} placeholder="Tienda web" className="campo" maxLength={40} /></div>
        <div className="w-28"><label className="etiqueta" htmlFor={`lp-${id}`}>Ajuste %</label><input id={`lp-${id}`} name="ajuste" inputMode="decimal" value={pct} onChange={(ev) => setPct(ev.target.value)} className="campo tabular-nums" aria-describedby={`le-${id}`} /></div>
        <div className="min-w-36"><label className="etiqueta" htmlFor={`lr-${id}`}>Redondeo</label>
          <select id={`lr-${id}`} name="redondeo" value={red} onChange={(ev) => setRed(Number(ev.target.value))} className="campo">{REDONDEOS.map((r) => <option key={r.valor} value={r.valor}>{r.texto}</option>)}</select></div>
        {l && <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" defaultChecked={l.activa} onChange={(ev) => { const h = ev.currentTarget.form?.querySelector<HTMLInputElement>("input[name=activa]"); if (h) h.value = ev.currentTarget.checked ? "si" : "no"; }} /> Activa</label>}
        <input type="hidden" name="activa" defaultValue={l?.activa === false ? "no" : "si"} />
        <button className="boton-sec" disabled={cargando}>{cargando ? "Guardando…" : l ? "Guardar" : <><Plus size={15} /> Agregar lista</>}</button>
        {l && <button type="button" className="pb-2 text-texto-2 hover:text-error" aria-label={`Quitar ${l.nombre}`} disabled={quitando} onClick={() => quitar(async () => setErrQuitar(await quitarLista(l.id)))}><Trash2 size={16} strokeWidth={1.8} /></button>}
      </div>
      <p id={`le-${id}`} className="text-xs text-texto-2">Ejemplo: un artículo de {pesos(EJEMPLO)} queda en <b className="text-texto">{pesos(aplicarLista(EJEMPLO, n, red))}</b>. Con «−» baja, con «+» sube.</p>
      <Mensaje a={e.error || e.ok ? e : errQuitar} />
    </form>
  );
}

export default function Listas({ listas, activas, mostrador, tienda }: { listas: Lista[]; activas: boolean; mostrador: number | null; tienda: number | null }) {
  const [e, accion, cargando] = useActionState(configurarListas, {});
  const activasListas = listas.filter((l) => l.activa);
  return (
    <div className="space-y-5">
      <form action={accion} className="tarjeta space-y-3">
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="activas" defaultChecked={activas} className="mt-1" />
          <span><b>Usar listas de precios.</b> <span className="text-texto-2">Apagado, todo se cobra al precio de Productos, como siempre.</span></span></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="etiqueta" htmlFor="l-mostrador">Lista del mostrador (caja, presupuestos, cambios)</label>
            <select id="l-mostrador" name="mostrador" defaultValue={mostrador ?? ""} className="campo"><option value="">El precio base</option>{activasListas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="l-tienda">Lista de la tienda online</label>
            <select id="l-tienda" name="tienda" defaultValue={tienda ?? ""} className="campo"><option value="">El precio base</option>{activasListas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}</select></div>
        </div>
        <Mensaje a={e} />
        <button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Guardar"}</button>
        <p className="text-xs text-texto-2">Los pedidos y ventas que ya se hicieron no cambian. Un pedido de la tienda se cotiza con la lista de la tienda cuando se hace.</p>
      </form>
      <div className="space-y-3"><h2 className="font-semibold">Mis listas</h2>
        {listas.map((l) => <FormLista key={l.id} l={l} />)}
        <FormLista />
      </div>
    </div>
  );
}
