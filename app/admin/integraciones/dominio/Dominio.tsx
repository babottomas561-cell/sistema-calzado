"use client";
// Dominio propio: agregarlo, ver qué registros cargar donde se compró (se revisa solo cada 10 minutos), usarlo como
// principal y, plegada, la conexión técnica con Vercel y Supabase (la carga una vez quien instaló el sistema).
import { useActionState, useState } from "react";
import { Check, CircleAlert, CircleCheck, Copy, Globe, RefreshCw } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { nombreCorto } from "@/lib/dns-guias";
import { accionDominio, agregarDominio, guardarHosting } from "../acciones";
import DiagnosticoDns from "./DiagnosticoDns";

export type Dom = { id: number; nombre: string; principal: boolean; verificado: boolean; configurado: boolean;
  registros: { tipo: string; nombre: string; valor: string }[]; error: string | null; revisado_en: string | null };
export type EstadoDom = { hosting: boolean; vercel_proyecto: string | null; vercel_equipo: string | null; vercel_token: string | null;
  supabase: boolean; supabase_ref: string | null; supabase_token: string | null; sitio_url: string | null; sitio_original: string | null };

function Aviso({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {e.ok}</p>;
  return null;
}

function Copiar({ texto }: { texto: string }) {
  const [listo, setListo] = useState(false);
  return <button type="button" onClick={() => { navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}
    className="rounded p-1 text-texto-2 hover:bg-gray-100" aria-label={`Copiar ${texto}`}>{listo ? <Check size={14} /> : <Copy size={14} strokeWidth={1.8} />}</button>;
}

function Tarjeta({ d }: { d: Dom }) {
  const [estado, accion, cargando] = useActionState(accionDominio, {});
  const www = d.nombre.startsWith("www.");
  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 font-semibold"><Globe size={16} strokeWidth={1.8} /> {d.nombre}
          {d.principal && <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs text-marca">Principal</span>}
          {www && <span className="text-xs font-normal text-texto-2">(redirige al principal)</span>}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${d.configurado ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>
          {d.configurado ? "Listo (con https)" : d.verificado ? "Falta apuntarlo" : "Esperando los registros"}</span>
      </div>
      {!d.configurado && d.registros.length > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p className="mb-2 text-xs text-texto-2">Cargá esto donde está la zona DNS de tu dominio (no hace falta que sea donde lo compraste: en NIC.ar, por ejemplo, solo se delega). Puede tardar de minutos a unas horas en verse.</p>
          <div className="-mx-1 overflow-x-auto px-1"><table className="tabla text-xs">
            <thead><tr><th>Tipo</th><th>Nombre</th><th>Valor</th></tr></thead>
            <tbody>{d.registros.map((r, i) => (
              <tr key={i}><td className="font-semibold">{r.tipo}</td>
                <td><span className="inline-flex items-center gap-1 font-mono">{nombreCorto(r.nombre, d.nombre)}<Copiar texto={nombreCorto(r.nombre, d.nombre)} /></span>
                  {nombreCorto(r.nombre, d.nombre) !== r.nombre && nombreCorto(r.nombre, d.nombre) !== "@" && <span className="block text-[10px] text-texto-2">Si te pide el nombre completo: <span className="font-mono">{r.nombre}</span></span>}</td>
                <td><span className="inline-flex items-center gap-1 break-all font-mono">{r.valor}<Copiar texto={r.valor} /></span></td></tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
      {!d.configurado && <DiagnosticoDns id={d.id} dominio={d.nombre} verificado={d.verificado} />}
      {d.error && <p className="flex items-center gap-1 text-xs text-error"><CircleAlert size={13} /> {d.error}</p>}
      <form action={accion} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={d.id} />
        <button name="que" value="revisar" className="boton-sec inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs" disabled={cargando}><RefreshCw size={13} /> Revisar ahora</button>
        {!www && !d.principal && <button name="que" value="principal" className="boton px-2.5 py-1.5 text-xs" disabled={cargando || !d.configurado}>Usar como principal</button>}
        {!d.principal && <button name="que" value="quitar" className="text-xs text-texto-2 hover:text-error" disabled={cargando}>Quitar</button>}
        <span className="text-xs text-texto-2">{d.revisado_en ? `Revisado ${fechaHora(d.revisado_en)} (se revisa solo cada 10 minutos)` : ""}</span>
      </form>
      <Aviso e={estado} />
    </li>
  );
}

export default function Dominio({ estado, dominios, actual }: { estado: EstadoDom; dominios: Dom[]; actual: string }) {
  const [agregado, agregar, agregando] = useActionState(agregarDominio, {});
  const [hosting, guardar, guardando] = useActionState(guardarHosting, {});
  return (
    <div className="space-y-5 px-5 py-4">
      <p className="text-sm">Dirección actual de la tienda: <b className="font-mono">{actual}</b></p>
      {!estado.hosting && <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} /> Falta la conexión técnica (abajo). La carga una sola vez quien instaló el sistema.</p>}

      <form action={agregar} className="space-y-2">
        <label className="etiqueta" htmlFor="dominio">1. Tu dominio</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="dominio" name="dominio" placeholder="mitienda.com.ar" className="campo" autoComplete="off" />
          <button className="boton" disabled={agregando || !estado.hosting}>{agregando ? "Agregando…" : "Agregar"}</button>
        </div>
        <p className="text-[11px] text-texto-2">Sin https ni www: se agregan solos el dominio y www (que lleva al principal).</p>
        <Aviso e={agregado} />
      </form>

      {dominios.length > 0 && <div><p className="text-sm font-semibold">2. Cargá los registros y esperá a que diga «Listo»</p>
        <ul className="divide-y divide-gray-100">{dominios.map((d) => <Tarjeta key={d.id} d={d} />)}</ul>
        <p className="text-xs text-texto-2">3. Cuando el dominio principal diga «Listo», tocá <b>Usar como principal</b>: la tienda, los mails de ingreso y Mercado Pago pasan a esa dirección. La de Meta (WhatsApp) hay que pegarla a mano en el webhook: está en Integraciones → WhatsApp.</p></div>}

      <details className="rounded-lg border border-borde p-3">
        <summary className="cursor-pointer text-sm font-semibold">Conexión técnica (la carga una vez quien instaló el sistema)</summary>
        <form action={guardar} className="mt-3 space-y-2">
          <p className="text-xs text-texto-2">Claves de acceso a Vercel (donde está publicada la tienda) y a Supabase (la base). Quedan guardadas en la base y nadie las puede volver a leer. Vacío = no se cambia.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="text-xs">Token de Vercel {estado.vercel_token && <span className="text-ok">(cargado {estado.vercel_token})</span>}<input name="vercel_token" type="password" autoComplete="off" className="campo mt-0.5" /></label>
            <label className="text-xs">Proyecto de Vercel<input name="vercel_proyecto" placeholder={estado.vercel_proyecto ?? "sistema-calzado"} className="campo mt-0.5" /></label>
            <label className="text-xs">Equipo de Vercel (team_… o slug)<input name="vercel_equipo" placeholder={estado.vercel_equipo ?? ""} className="campo mt-0.5" /></label>
            <label className="text-xs">Token de Supabase {estado.supabase_token && <span className="text-ok">(cargado {estado.supabase_token})</span>}<input name="supabase_token" type="password" autoComplete="off" className="campo mt-0.5" /></label>
            <label className="text-xs">Ref del proyecto de Supabase<input name="supabase_ref" placeholder={estado.supabase_ref ?? ""} className="campo mt-0.5" /></label>
          </div>
          <Aviso e={hosting} />
          <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Guardar conexión técnica"}</button>
        </form>
      </details>
    </div>
  );
}
