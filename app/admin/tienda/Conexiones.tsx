"use client";
// Conexiones con WhatsApp (Meta) y la IA (Gemini). Las claves se escriben acá y se guardan en la base, que no las
// devuelve nunca: se ve si están cargadas (con los últimos 4 caracteres). Dejar un campo vacío no cambia nada.
import { useActionState, useState } from "react";
import { CircleCheck, CircleAlert, Copy, Check, Send } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { guardarConexiones, probarWhatsApp } from "./acciones";

export type EstadoConexiones = {
  phone_number_id: string | null; waba_id: string | null; token: string | null; secreto: string | null; gemini: string | null;
  verify_token: string; meta_lista: boolean; actualizado_en: string;
};
type Envio = { id: number; fecha: string; tipo: string; telefono: string; detalle: string | null; estado: string; error: string | null };

function Copiar({ texto }: { texto: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}
      className="boton-sec shrink-0 px-2.5 py-1.5" aria-label="Copiar">{listo ? <Check size={15} /> : <Copy size={15} strokeWidth={1.8} />}</button>
  );
}

// Un campo de clave: muestra si ya hay una cargada y deja reemplazarla o quitarla
function Clave({ nombre, etiqueta, cargada, ayuda, quitar, tipo = "password" }: { nombre: string; etiqueta: string; cargada: string | null; ayuda: string; quitar?: string; tipo?: string }) {
  return (
    <div>
      <label className="etiqueta flex items-center justify-between gap-2">{etiqueta}
        {cargada ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> Cargada {cargada}</span>
          : <span className="text-xs font-normal text-alerta">Sin cargar</span>}</label>
      <input name={nombre} type={tipo} autoComplete="off" aria-label={etiqueta} placeholder={cargada ? "Dejalo vacío para no cambiarla" : ""} className="campo" />
      <p className="mt-0.5 text-[11px] text-texto-2">{ayuda}</p>
      {cargada && quitar && <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-texto-2"><input type="checkbox" name="quitar" value={quitar} /> Quitarla</label>}
    </div>
  );
}

export default function Conexiones({ estado, webhook, envios }: { estado: EstadoConexiones; webhook: string; envios: Envio[] }) {
  const [guardado, guardar, guardando] = useActionState(guardarConexiones, {});
  const [prueba, probar, probando] = useActionState(probarWhatsApp, {});
  return (
    <div className="space-y-5 px-5 py-4">
      <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <p className={`flex items-center gap-1.5 rounded-lg p-2.5 ${estado.meta_lista ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>
          {estado.meta_lista ? <CircleCheck size={16} /> : <CircleAlert size={16} />} WhatsApp (Meta): {estado.meta_lista ? "conectado" : "falta configurar"}</p>
        <p className={`flex items-center gap-1.5 rounded-lg p-2.5 ${estado.gemini ? "bg-green-50 text-ok" : "bg-gray-50 text-texto-2"}`}>
          {estado.gemini ? <CircleCheck size={16} /> : <CircleAlert size={16} />} IA (Gemini): {estado.gemini ? "cargada" : "sin cargar (el bot contesta un mensaje fijo)"}</p>
      </div>

      <div className="space-y-2 rounded-lg border border-borde p-3 text-sm">
        <p className="font-semibold">1. En Meta, configurá el webhook con estos dos datos</p>
        <div><span className="etiqueta">URL de devolución de llamada</span>
          <div className="flex gap-2"><input readOnly value={webhook} className="campo font-mono text-xs" aria-label="URL del webhook" /><Copiar texto={webhook} /></div></div>
        <div><span className="etiqueta">Token de verificación</span>
          <div className="flex gap-2"><input readOnly value={estado.verify_token} className="campo font-mono text-xs" aria-label="Token de verificación" /><Copiar texto={estado.verify_token} /></div></div>
        <p className="text-[11px] text-texto-2">Después, en «Campos del webhook», suscribite a <b>messages</b>.</p>
      </div>

      <form action={guardar} className="space-y-3">
        <p className="text-sm font-semibold">2. Pegá las claves de Meta y de Gemini</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Clave nombre="phone_number_id" etiqueta="ID del número de teléfono" tipo="text" cargada={estado.phone_number_id}
            ayuda="Meta → WhatsApp → Configuración de la API. Son solo números." quitar="numero" />
          <Clave nombre="waba_id" etiqueta="ID de la cuenta de WhatsApp Business" tipo="text" cargada={estado.waba_id}
            ayuda="En la misma pantalla, debajo del ID del número." />
          <Clave nombre="access_token" etiqueta="Token de acceso (permanente)" cargada={estado.token}
            ayuda="El de un usuario del sistema (Configuración del negocio → Usuarios del sistema). El temporal vence en 24 h." quitar="token" />
          <Clave nombre="app_secret" etiqueta="Clave secreta de la app" cargada={estado.secreto}
            ayuda="developers.facebook.com → tu app → Configuración → Básica. Sin ella no se aceptan mensajes." quitar="secreto" />
          <Clave nombre="gemini_api_key" etiqueta="Clave de Gemini (opcional)" cargada={estado.gemini}
            ayuda="aistudio.google.com → Get API key. Sin ella, el bot contesta un mensaje fijo y ustedes siguen la charla." quitar="gemini" />
        </div>
        {guardado.error && <p className="text-sm text-error">{guardado.error}</p>}
        {guardado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {guardado.ok}</p>}
        <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar conexiones"}</button>
        <p className="text-[11px] text-texto-2">Última modificación: {fechaHora(estado.actualizado_en)}</p>
      </form>

      <form action={probar} className="space-y-2 rounded-lg border border-borde p-3">
        <p className="text-sm font-semibold">3. Probá que ande</p>
        <p className="text-xs text-texto-2">Manda la plantilla de prueba de Meta («Hello World»). Mientras la cuenta está en prueba, el número tiene que estar agregado en Meta como destinatario.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input name="telefono" type="tel" required placeholder="Tu celular: 381 555 1234" className="campo" aria-label="Teléfono para la prueba" />
          <button className="boton-sec inline-flex items-center justify-center gap-1.5" disabled={probando || !estado.meta_lista}><Send size={15} strokeWidth={1.8} />{probando ? "Mandando…" : "Mandar prueba"}</button>
        </div>
        {prueba.error && <p className="text-sm text-error">{prueba.error}</p>}
        {prueba.ok && <p className="text-sm text-ok">{prueba.ok}</p>}
      </form>

      {envios.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 font-semibold">Últimos envíos</p>
          <ul className="divide-y divide-gray-100">{envios.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3 py-2">
              <span className="min-w-0"><span className="text-texto-2">{fechaHora(e.fecha)} · </span>{e.detalle ?? e.tipo} <span className="text-texto-2">· {e.telefono}</span>
                {e.error && <span className="block text-xs text-error">{e.error}</span>}</span>
              <span className={`shrink-0 text-xs font-semibold ${e.estado === "ok" ? "text-ok" : e.estado === "error" ? "text-error" : "text-texto-2"}`}>
                {e.estado === "ok" ? "Aceptado" : e.estado === "error" ? "Rechazado" : "Enviando"}</span>
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}
