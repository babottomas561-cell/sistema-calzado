"use client";
// Qué hace el sistema con las conexiones: el bot (con qué modelo de Gemini), los avisos de pedidos (con qué plantilla
// de Meta), probar la clave de la IA y cuánto se usó este mes. Los precios de la IA se suman solos a Gastos.
import { useActionState, useState } from "react";
import { Bell, Bot, CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { guardarAutomatizaciones, probarGemini } from "./acciones";

const MODELOS = [
  { id: "gemini-2.5-flash", texto: "Gemini 2.5 Flash (recomendado: rápido y barato)" },
  { id: "gemini-2.5-flash-lite", texto: "Gemini 2.5 Flash-Lite (el más barato)" },
  { id: "gemini-2.5-pro", texto: "Gemini 2.5 Pro (el más inteligente, más caro)" },
];

export type Config = {
  wa_bot_activo: boolean; wa_notificaciones_pedidos: boolean; wa_plantilla_estado: string | null; wa_idioma_plantilla: string;
  ia_modelo: string;
};
export type PreciosIA = { ia_precio_entrada: number; ia_precio_salida: number } | null;
export type EstadoIA = {
  gemini: string | null;
  ia_prueba: { estado: "probando" | "ok" | "error"; fecha?: string; error?: string | null } | null;
  ia_mes: { respuestas: number; tokens: number; costo_usd: number };
};

function Interruptor({ nombre, activo, titulo, texto, icono: Icono }: { nombre: string; activo: boolean; titulo: string; texto: string; icono: typeof Bot }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-borde p-3 hover:border-gray-300">
      <input type="checkbox" name={nombre} defaultChecked={activo} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
      <span className="text-xs"><span className="flex items-center gap-1 font-semibold text-texto"><Icono size={14} strokeWidth={1.8} /> {titulo}</span>
        <span className="text-texto-2">{texto}</span></span>
    </label>
  );
}

export default function Automatizaciones({ config, precios, ia }: { config: Config; precios: PreciosIA; ia: EstadoIA }) {
  const [estado, guardar, guardando] = useActionState(guardarAutomatizaciones, {});
  const [prueba, probar, probando] = useActionState(probarGemini, {});
  const conocido = MODELOS.some((m) => m.id === config.ia_modelo);
  const [modelo, setModelo] = useState(conocido ? config.ia_modelo : "otro");

  return (
    <div className="space-y-5 px-5 py-4">
      <form action={guardar} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Interruptor nombre="wa_bot_activo" activo={config.wa_bot_activo} icono={Bot} titulo="Bot de WhatsApp"
            texto="Contesta solo las consultas de catálogo, stock por talle, el estado del pedido y los datos del local. Sin clave de Gemini, contesta un mensaje fijo." />
          <Interruptor nombre="wa_notificaciones_pedidos" activo={config.wa_notificaciones_pedidos} icono={Bell} titulo="Avisos de pedidos"
            texto="Le avisa al cliente cuando su pedido se confirma, está listo, sale, se entrega o se cancela. Necesita la plantilla de abajo." />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
          <div><label className="etiqueta" htmlFor="wa_plantilla_estado">Plantilla de Meta para los avisos</label>
            <input id="wa_plantilla_estado" name="wa_plantilla_estado" defaultValue={config.wa_plantilla_estado ?? ""} placeholder="estado_pedido" className="campo" />
            <p className="mt-0.5 text-[11px] text-texto-2">Aprobada en Meta, con tres variables en este orden: nombre, comprobante y estado.</p></div>
          <div><label className="etiqueta" htmlFor="wa_idioma_plantilla">Idioma</label>
            <input id="wa_idioma_plantilla" name="wa_idioma_plantilla" defaultValue={config.wa_idioma_plantilla} placeholder="es_AR" className="campo" /></div>
        </div>

        <div className="space-y-2 rounded-lg border border-borde p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles size={15} strokeWidth={1.8} /> Inteligencia artificial (Gemini)</p>
          <div><label className="etiqueta" htmlFor="ia_modelo">Modelo</label>
            <select id="ia_modelo" name="ia_modelo" value={modelo} onChange={(e) => setModelo(e.target.value)} className="campo">
              {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}
              <option value="otro">Otro (escribirlo)</option>
            </select>
            {modelo === "otro" && <input name="ia_modelo_otro" defaultValue={conocido ? "" : config.ia_modelo} placeholder="gemini-3.0-flash" className="campo mt-2" aria-label="Nombre del modelo" />}
            <p className="mt-0.5 text-[11px] text-texto-2">Si Google retira un modelo, elegí otro acá. Los nombres están en ai.google.dev/gemini-api/docs/models.</p></div>
          {precios ? (
            <div className="grid grid-cols-2 gap-2">
              <div><label className="etiqueta" htmlFor="ia_precio_entrada">US$ por millón de tokens (entrada)</label>
                <input id="ia_precio_entrada" name="ia_precio_entrada" type="number" min={0} step="0.0001" defaultValue={precios.ia_precio_entrada} className="campo" /></div>
              <div><label className="etiqueta" htmlFor="ia_precio_salida">US$ por millón (salida)</label>
                <input id="ia_precio_salida" name="ia_precio_salida" type="number" min={0} step="0.0001" defaultValue={precios.ia_precio_salida} className="campo" /></div>
              <p className="col-span-2 text-[11px] text-texto-2">Con el plan gratis de Google, dejalos en 0. Si pasás a pago, cargá los precios del modelo y el gasto se suma solo en Gastos → Inteligencia artificial.</p>
            </div>
          ) : <p className="text-[11px] text-texto-2">Los precios de la IA los carga quien tiene el permiso de Gastos.</p>}
        </div>

        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
        <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar bot y avisos"}</button>
      </form>

      <form action={probar} className="space-y-2 rounded-lg border border-borde p-3 text-sm">
        <p className="font-semibold">Probar la IA</p>
        <p className="text-xs text-texto-2">Le hace una pregunta corta a Gemini con la clave y el modelo guardados, para saber si andan sin esperar a que escriba un cliente.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton-sec" disabled={probando || !ia.gemini}>{probando ? "Probando…" : "Probar Gemini"}</button>
          {!ia.gemini && <span className="text-xs text-alerta">Primero cargá la clave de Gemini arriba</span>}
          {ia.ia_prueba?.estado === "ok" && <span className="flex items-center gap-1 text-ok"><CircleCheck size={15} /> Funciona{ia.ia_prueba.fecha && ` (probado ${fechaHora(ia.ia_prueba.fecha)})`}</span>}
          {ia.ia_prueba?.estado === "probando" && <span className="text-texto-2">Esperando la respuesta de Google…</span>}
          {ia.ia_prueba?.estado === "error" && <span className="flex items-center gap-1 text-error"><CircleAlert size={15} /> No anduvo: {ia.ia_prueba.error ?? "sin respuesta"}</span>}
        </div>
        {prueba.error && <p className="text-error">{prueba.error}</p>}
        {prueba.ok && <p className="text-texto-2">{prueba.ok}</p>}
        <p className="text-xs text-texto-2">Este mes: {ia.ia_mes.respuestas} respuestas del bot · {ia.ia_mes.tokens.toLocaleString("es-AR")} tokens · US$ {Number(ia.ia_mes.costo_usd).toLocaleString("es-AR", { maximumFractionDigits: 2 })}</p>
      </form>
    </div>
  );
}
