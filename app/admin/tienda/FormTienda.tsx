"use client";
// Datos de la tienda: el nombre, los avisos de arriba, Instagram y lo que ve el cliente al hacer un pedido
// (a qué WhatsApp llega, dónde se retira y el horario).
import { useActionState } from "react";
import { CircleCheck, MessageSquare, Bell } from "lucide-react";
import { guardarTienda } from "./acciones";

type Tienda = {
  nombre: string;
  avisos: string[];
  aviso_enlace: string | null;
  instagram: string | null;
  whatsapp: string | null;
  direccion_retiro: string | null;
  horario: string | null;
  dias_retiro: number;
  dias_cambio: number;
  dias_saldo: number;
  wa_bot_activo?: boolean | null;
  wa_notificaciones_pedidos?: boolean | null;
  wa_plantilla_estado?: string | null;
  wa_idioma_plantilla?: string | null;
};

type Integracion = { meta: boolean; gemini: boolean; webhook: string };

export default function FormTienda({ tienda, integracion }: { tienda: Tienda; integracion: Integracion }) {
  const [estado, accion, cargando] = useActionState(guardarTienda, {});
  return (
    <form action={accion} className="grid gap-4 px-5 py-4 sm:grid-cols-2">
      <div><label className="etiqueta">Nombre de la tienda</label><input name="nombre" defaultValue={tienda.nombre} className="campo" /></div>
      <div><label className="etiqueta">Instagram</label>
        <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-2">@</span>
          <input name="instagram" defaultValue={tienda.instagram ?? ""} placeholder="mitienda" className="campo pl-7" /></div></div>
      <div className="sm:col-span-2"><label className="etiqueta">Avisos de arriba (opcional, uno por renglón)</label>
        <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
          <textarea name="avisos" rows={3} defaultValue={tienda.avisos.join("\n")} placeholder={"6 cuotas sin interés\nEnvío gratis en San Miguel de Tucumán\nRetiro sin cargo en el local"} className="campo" />
          <input name="aviso_enlace" defaultValue={tienda.aviso_enlace ?? ""} placeholder="Link: /tienda (opcional)" className="campo h-fit" aria-label="Link de los avisos" /></div>
        <p className="mt-0.5 text-[11px] text-texto-2">Una franja fina arriba de todo. Si ponés varios (hasta 5), rotan solos. Vacío, no se muestra.</p></div>

      {/* Sección Configuración de WhatsApp */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:col-span-2 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-marca flex items-center gap-1.5">
            <MessageSquare size={16} /> WhatsApp y Automatizaciones
          </h3>
          <p className="text-xs text-texto-2">Número de atención y funciones automáticas del bot y notificaciones.</p>
        </div>

        <div className="grid gap-2 rounded-lg border border-borde bg-white p-3 text-xs sm:grid-cols-2">
          <p><span className={integracion.meta ? "text-ok" : "text-alerta"}>{integracion.meta ? "Configurado" : "Falta configurar"}</span><br />Conexión con Meta WhatsApp</p>
          <p><span className={integracion.gemini ? "text-ok" : "text-alerta"}>{integracion.gemini ? "Configurado" : "Falta configurar"}</span><br />Asistente de Gemini</p>
          <p className="break-all text-texto-2 sm:col-span-2">Webhook para Meta: <b className="text-texto">{integracion.webhook}</b></p>
          {(!integracion.meta || !integracion.gemini) && <p className="text-alerta sm:col-span-2">Las claves privadas se cargan como secretos del servidor. Hasta completarlas, el panel conserva la configuración pero no activa la conexión externa.</p>}
        </div>

        <div>
          <label className="etiqueta">WhatsApp para los pedidos y atención</label>
          <input name="whatsapp" type="tel" defaultValue={tienda.whatsapp ?? ""} placeholder="549 381 555-1234" className="campo bg-white" />
          <p className="mt-0.5 text-[11px] text-texto-2">Con el 54, el 9 y el código de área. Al confirmar un pedido, el cliente lo manda a este número.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <label className="flex items-start gap-2.5 rounded-lg border border-borde bg-white p-3 cursor-pointer hover:border-gray-300">
            <input
              type="checkbox"
              name="wa_bot_activo"
              defaultChecked={tienda.wa_bot_activo ?? false}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-marca focus:ring-marca"
            />
            <div className="text-xs">
              <span className="font-semibold text-texto block">Bot de respuestas con IA</span>
              <span className="text-texto-2">Responde automáticamente consultas de catálogo, stock por talle, pedidos y horarios vía Gemini.</span>
            </div>
          </label>

          <label className="flex items-start gap-2.5 rounded-lg border border-borde bg-white p-3 cursor-pointer hover:border-gray-300">
            <input
              type="checkbox"
              name="wa_notificaciones_pedidos"
              defaultChecked={tienda.wa_notificaciones_pedidos ?? false}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-marca focus:ring-marca"
            />
            <div className="text-xs">
              <span className="font-semibold text-texto block flex items-center gap-1">
                <Bell size={13} className="text-alerta" /> Notificaciones de pedidos
              </span>
              <span className="text-texto-2">Avisa por WhatsApp al cliente cuando el pedido pasa a confirmado, listo para retirar o entregado.</span>
            </div>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
          <div><label className="etiqueta">Plantilla de Meta para estados</label>
            <input name="wa_plantilla_estado" defaultValue={tienda.wa_plantilla_estado ?? ""} placeholder="estado_pedido" className="campo bg-white" />
            <p className="mt-0.5 text-[11px] text-texto-2">Debe estar aprobada en Meta y llevar tres variables, en este orden: nombre, comprobante y estado.</p></div>
          <div><label className="etiqueta">Idioma</label>
            <input name="wa_idioma_plantilla" defaultValue={tienda.wa_idioma_plantilla ?? "es_AR"} placeholder="es_AR" className="campo bg-white" /></div>
        </div>
      </div>

      <div><label className="etiqueta">Horario</label><input name="horario" defaultValue={tienda.horario ?? ""} placeholder="Lun a sáb de 9 a 13 y de 17 a 21" className="campo" /></div>
      <div><label className="etiqueta">Días que se guarda un pedido para retirar</label>
        <input name="dias_retiro" type="number" min={1} max={90} defaultValue={tienda.dias_retiro} className="campo" />
        <p className="mt-0.5 text-[11px] text-texto-2">Si no lo retiran en ese plazo, se cancela solo y el stock vuelve a la venta. El cliente ve la fecha.</p></div>
      <div><label className="etiqueta">Plazo para cambios y devoluciones (días)</label>
        <input name="dias_cambio" type="number" min={1} max={365} defaultValue={tienda.dias_cambio} className="campo" />
        <p className="mt-0.5 text-[11px] text-texto-2">Desde la compra. Pasado el plazo, solo el encargado puede aceptar una devolución.</p></div>
      <div><label className="etiqueta">Vencimiento del saldo a favor (días)</label>
        <input name="dias_saldo" type="number" min={7} max={730} defaultValue={tienda.dias_saldo} className="campo" />
        <p className="mt-0.5 text-[11px] text-texto-2">Desde la devolución. Cambiarlo no toca los saldos que ya se dieron.</p></div>
      <div className="sm:col-span-2"><label className="etiqueta">Dirección para retirar</label><input name="direccion_retiro" defaultValue={tienda.direccion_retiro ?? ""} placeholder="Av. Mate de Luna 1234, San Miguel de Tucumán" className="campo" /></div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="boton" disabled={cargando}>Guardar</button>
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
        {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      </div>
    </form>
  );
}
