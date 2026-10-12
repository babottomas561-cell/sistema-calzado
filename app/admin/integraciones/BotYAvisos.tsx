"use client";
// WhatsApp: qué hace el sistema con la conexión. El bot (contesta solo) y los avisos de pedidos (con su plantilla de Meta).
import { useActionState } from "react";
import { Bell, Bot, CircleCheck } from "lucide-react";
import { guardarBotYAvisos } from "./acciones";

export type ConfigBot = { wa_bot_activo: boolean; wa_notificaciones_pedidos: boolean; wa_plantilla_estado: string | null; wa_idioma_plantilla: string };

function Interruptor({ nombre, activo, titulo, texto, icono: Icono }: { nombre: string; activo: boolean; titulo: string; texto: string; icono: typeof Bot }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-borde p-3 hover:border-gray-300">
      <input type="checkbox" name={nombre} defaultChecked={activo} className="mt-0.5 h-4 w-4 rounded border-gray-300" />
      <span className="text-xs"><span className="flex items-center gap-1 font-semibold text-texto"><Icono size={14} strokeWidth={1.8} /> {titulo}</span>
        <span className="text-texto-2">{texto}</span></span>
    </label>
  );
}

export default function BotYAvisos({ config }: { config: ConfigBot }) {
  const [estado, guardar, guardando] = useActionState(guardarBotYAvisos, {});
  return (
    <div className="px-5 py-4">
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

        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
        <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar bot y avisos"}</button>
      </form>
    </div>
  );
}
