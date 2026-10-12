"use client";
// Mercado Pago en Integraciones: las claves (se guardan, no se leen), de quién es la cuenta conectada, la dirección
// para los avisos y cómo cobra la tienda (sin Mercado Pago, como opción o solo online; cuotas máximas).
import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, Copy, Check } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { guardarCobro, guardarMercadoPago, probarMercadoPago } from "./acciones";

export type EstadoMP = {
  token: string | null; secreto: string | null; sitio_url: string | null;
  cuenta: { ok: boolean; fecha: string; usuario?: string; nombre?: string; pais?: string; email?: string; prueba?: boolean; error?: string } | null;
  pagos_mes: { aprobados: number; cobrado: number; comision: number };
};

function Aviso({ estado }: { estado: { error?: string; ok?: string } }) {
  if (estado.error) return <p className="text-sm text-error">{estado.error}</p>;
  if (estado.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>;
  return null;
}

function Copiar({ texto }: { texto: string }) {
  const [listo, setListo] = useState(false);
  return <button type="button" onClick={() => { navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}
    className="boton-sec shrink-0 px-2.5 py-1.5" aria-label="Copiar">{listo ? <Check size={15} /> : <Copy size={15} strokeWidth={1.8} />}</button>;
}

function Clave({ nombre, etiqueta, cargada, ayuda, quitar }: { nombre: string; etiqueta: string; cargada: string | null; ayuda: string; quitar: string }) {
  return (
    <div>
      <label className="etiqueta flex items-center justify-between gap-2" htmlFor={nombre}>{etiqueta}
        {cargada ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> Cargada {cargada}</span>
          : <span className="text-xs font-normal text-alerta">Sin cargar</span>}</label>
      <input id={nombre} name={nombre} type="password" autoComplete="off" placeholder={cargada ? "Dejalo vacío para no cambiarla" : ""} className="campo" />
      <p className="mt-0.5 text-[11px] text-texto-2">{ayuda}</p>
      {cargada && <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-texto-2"><input type="checkbox" name="quitar" value={quitar} /> Quitarla</label>}
    </div>
  );
}

export default function MercadoPago({ estado, modo, cuotasMax, webhook }: { estado: EstadoMP; modo: string; cuotasMax: number; webhook: string }) {
  const [guardado, guardar, guardando] = useActionState(guardarMercadoPago, {});
  const [prueba, probar, probando] = useActionState(probarMercadoPago, {});
  const [cobro, guardarModo, guardandoModo] = useActionState(guardarCobro, {});
  const c = estado.cuenta;
  return (
    <div className="space-y-5 px-5 py-4">
      {c?.ok ? (
        <div className={`rounded-lg p-3 text-sm ${c.prueba ? "bg-amber-50 text-alerta" : "bg-green-50 text-ok"}`}>
          <p className="flex items-center gap-1.5 font-semibold"><CircleCheck size={16} /> Conectado a la cuenta {c.usuario}{c.nombre ? ` (${c.nombre})` : ""}{c.pais ? ` · ${c.pais}` : ""}</p>
          <p className="text-xs">{c.prueba ? "Es una cuenta de PRUEBA: los pagos no son de verdad. Para cobrar, cargá las credenciales de producción." : "Revisá que sea la cuenta del local (a nombre del negocio) y no una personal."} Probado {fechaHora(c.fecha)}.</p>
        </div>
      ) : c && !c.ok ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-error"><CircleAlert size={16} /> No conecta: {c.error}</p>
      ) : <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} /> Mercado Pago: falta configurar</p>}

      <form action={guardar} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Clave nombre="mp_access_token" etiqueta="Access Token" cargada={estado.token} quitar="mp_token"
            ayuda="Mercado Pago Developers → Tus integraciones → tu aplicación → Credenciales de producción. Empieza con APP_USR-." />
          <Clave nombre="mp_webhook_secret" etiqueta="Clave secreta de las notificaciones" cargada={estado.secreto} quitar="mp_secreto"
            ayuda="En la misma aplicación → Webhooks → Configurar notificaciones → «Clave secreta». Sirve para comprobar que el aviso viene de Mercado Pago." />
        </div>
        <div><span className="etiqueta">URL para las notificaciones (pegala en Webhooks, evento «Pagos»)</span>
          <div className="flex gap-2"><input readOnly value={webhook} className="campo font-mono text-xs" aria-label="URL de notificaciones de Mercado Pago" /><Copiar texto={webhook} /></div></div>
        <Aviso estado={guardado} />
        <div className="flex flex-wrap gap-2">
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar Mercado Pago"}</button>
        </div>
      </form>
      <form action={probar} className="flex flex-wrap items-center gap-3">
        <button className="boton-sec" disabled={probando || !estado.token}>{probando ? "Probando…" : "Probar conexión"}</button>
        <Aviso estado={prueba} />
      </form>

      <form action={guardarModo} className="space-y-3 rounded-lg border border-borde p-3">
        <p className="text-sm font-semibold">Cómo cobra la tienda</p>
        <fieldset className="space-y-1.5 text-sm">
          {[["no", "Sin Mercado Pago", "Como hasta ahora: el pedido se reserva y el pago se coordina (WhatsApp, al retirar)."],
            ["opcional", "Mercado Pago como opción", "El cliente elige: pagar online con Mercado Pago o con los otros medios de la tienda."],
            ["obligatorio", "Solo online", "Todo pedido de la tienda se paga con Mercado Pago al confirmarlo."]].map(([v, t, d]) => (
            <label key={v} className="flex items-start gap-2"><input type="radio" name="mp_modo" value={v} defaultChecked={modo === v} className="mt-1" />
              <span><b>{t}</b> <span className="text-texto-2">— {d}</span></span></label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">Hasta
          <select name="mp_cuotas_max" defaultValue={cuotasMax} className="campo w-20 py-1.5">{[1, 3, 6, 9, 12].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          cuotas <span className="text-xs text-texto-2">(el costo de las cuotas lo define tu cuenta de Mercado Pago)</span></label>
        <Aviso estado={cobro} />
        <button className="boton-sec" disabled={guardandoModo}>{guardandoModo ? "Guardando…" : "Guardar cómo cobra"}</button>
      </form>

      <p className="text-xs text-texto-2">Este mes: {estado.pagos_mes.aprobados} pagos aprobados · {pesos(estado.pagos_mes.cobrado)} cobrados · {pesos(estado.pagos_mes.comision)} de comisión (ya anotada en Gastos).</p>
    </div>
  );
}
