"use client";
// El envío de un pedido: los datos para pedir el Uber (copiar y abrir la app) y anotar cómo salió y cuánto costó.
// Cuando el local tenga Uber Direct, esto se completa solo.
import { useActionState, useState } from "react";
import { Check, CircleCheck, Copy, ExternalLink, Truck } from "lucide-react";
import { pesos } from "@/lib/formato";
import { registrarEnvio } from "../acciones";

type Datos = {
  pedido: number; comprobante: string; cliente: string; telefono: string | null; direccion: string | null; zona: string | null;
  cobrado: number; envio: { proveedor: string | null; costo_real: number | null; seguimiento: string | null; notas: string | null } | null;
};
const PROVEEDORES = [["uber", "Uber"], ["cadete", "Cadete propio"], ["andreani", "Andreani"], ["correo", "Correo Argentino"], ["otro", "Otro"]];

export default function Envio({ d, local }: { d: Datos; local: string | null }) {
  const [estado, accion, guardando] = useActionState(registrarEnvio, {});
  const [copiado, setCopiado] = useState(false);
  const datos = [`Pedido ${d.comprobante}`, local ? `Retirar en: ${local}` : null, `Entregar a: ${d.cliente}${d.telefono ? ` — ${d.telefono}` : ""}`,
    `Dirección: ${d.direccion ?? ""}${d.zona ? ` (${d.zona})` : ""}`].filter(Boolean).join("\n");
  const e = d.envio;
  const margen = e?.costo_real != null ? d.cobrado - e.costo_real : null;
  return (
    <section className="tarjeta space-y-3 text-sm">
      <h2 className="flex items-center gap-1.5 font-semibold"><Truck size={17} strokeWidth={1.8} /> Envío</h2>
      <div className="space-y-0.5">
        <p><b>{d.zona ?? "Sin zona"}</b> · el cliente pagó {d.cobrado > 0 ? pesos(d.cobrado) : "nada (a coordinar)"}</p>
        <p className="text-texto-2">{d.direccion}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { navigator.clipboard.writeText(datos); setCopiado(true); setTimeout(() => setCopiado(false), 1500); }}
          className="boton-sec inline-flex items-center gap-1.5">{copiado ? <Check size={15} /> : <Copy size={15} strokeWidth={1.8} />} Copiar datos para Uber</button>
        <a href="https://m.uber.com/" target="_blank" rel="noopener" className="boton-sec inline-flex items-center gap-1.5"><ExternalLink size={15} strokeWidth={1.8} /> Abrir Uber</a>
      </div>
      <p className="text-xs text-texto-2">En la app de Uber elegí <b>Envíos</b>, pegá la dirección y, cuando lo pidas, anotá abajo lo que te cobró y el link de seguimiento (el cliente lo ve en su pedido).</p>

      <form action={accion} className="space-y-2 border-t border-borde pt-3">
        <input type="hidden" name="pedido_id" value={d.pedido} />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select name="proveedor" defaultValue={e?.proveedor ?? "uber"} className="campo" aria-label="Con qué se mandó">
            {PROVEEDORES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
            <input name="costo_real" inputMode="decimal" defaultValue={e?.costo_real ?? ""} placeholder="Lo que costó" className="campo pl-7" aria-label="Lo que costó el envío" /></div>
        </div>
        <input name="seguimiento" defaultValue={e?.seguimiento ?? ""} placeholder="Link o código de seguimiento (opcional)" className="campo" aria-label="Seguimiento" />
        <input name="notas" defaultValue={e?.notas ?? ""} placeholder="Notas (opcional)" className="campo" aria-label="Notas del envío" />
        {estado.error && <p className="text-error">{estado.error}</p>}
        {estado.ok && <p className="flex items-center gap-1.5 text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Anotar envío"}</button>
          {margen !== null && <span className={`text-xs ${margen < 0 ? "text-error" : "text-texto-2"}`}>
            {margen < 0 ? `El envío costó ${pesos(-margen)} más de lo que pagó el cliente` : `Quedan ${pesos(margen)} a favor del envío`}</span>}
        </div>
      </form>
    </section>
  );
}
