"use client";
// La dirección de avisos de Mercado Pago se carga a mano en su panel: acá se confirma cuál se cargó y se avisa si el sitio cambió de dirección.
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { confirmarWebhookMp } from "./acciones";

export default function AvisoWebhook({ actual, cargada, desactualizada }: { actual: string; cargada: string | null; desactualizada: boolean }) {
  const [estado, accion, cargando] = useActionState(confirmarWebhookMp, {});
  if (cargada && !desactualizada) return <p className="flex items-center gap-1.5 px-5 pt-4 text-xs text-ok"><CircleCheck size={14} /> La dirección de avisos cargada en Mercado Pago es la actual.</p>;
  return (
    <form action={accion} className={`m-5 mb-0 space-y-2 rounded-lg p-3 text-sm ${desactualizada ? "bg-amber-50 text-alerta" : "bg-gray-50 text-texto-2"}`}>
      <p className="flex items-start gap-1.5"><CircleAlert size={15} className="mt-0.5 shrink-0" />
        {desactualizada ? <span>La dirección del sitio cambió. Actualizá el webhook en Mercado Pago (Tus integraciones → tu aplicación → Webhooks → Modo productivo) con <b className="break-all">{actual}</b>. Mientras tanto la anterior sigue funcionando.</span>
          : <span>Cuando cargues la URL en Mercado Pago (Webhooks), confirmalo acá y el sistema te avisa si algún día la dirección del sitio cambia.</span>}</p>
      {estado.error && <p role="alert" className="text-error">{estado.error}</p>}
      <button className="boton-sec h-9 px-3 text-sm" disabled={cargando}>{cargando ? "Guardando…" : desactualizada ? "Ya la actualicé" : "Ya la cargué en Mercado Pago"}</button>
    </form>
  );
}
