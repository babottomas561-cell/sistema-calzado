// «Avisos al cliente» de un pedido: por qué canal se le avisa cada paso y qué pasó. Depende de lo que esté conectado:
//   · WhatsApp (Meta): si está conectado y con la plantilla, avisa solo; si no, queda el botón para escribirle vos con el mensaje ya armado.
//   · Mail: si el correo está conectado, avisa solo (con el PDF cuando paga); si no, se dice y se lleva a conectarlo.
import Link from "next/link";
import { CircleCheck, Clock, Mail, MessageCircle, TriangleAlert } from "lucide-react";
import { paraWhatsApp } from "@/lib/telefono";
import { fechaHora } from "@/lib/formato";

export type EnvioMail = { id: number; clave: string; estado: string; creado_en: string; error: string | null; para: string };
const NOMBRE: Record<string, string> = { pedido_recibido: "Pedido recibido", pedido_pagado: "Pago recibido (con PDF)", pedido_confirmado: "Pedido confirmado", pedido_listo: "Listo para retirar",
  pedido_enviado: "En camino", pedido_entregado: "Entregado", pedido_cancelado: "Cancelado" };

export default function Avisos({ cliente, telefono, email, estado, comprobante, mensaje, waAuto, mailListo, mailMotivo, puedeConectar, envios }: {
  cliente: string; telefono: string | null; email: string | null; estado: string; comprobante: string; mensaje: string; waAuto: boolean; mailListo: boolean; mailMotivo?: string; puedeConectar: boolean; envios: EnvioMail[];
}) {
  const wa = paraWhatsApp(telefono);
  return (
    <section className="tarjeta space-y-3 text-sm" aria-labelledby="avisos-titulo">
      <h2 id="avisos-titulo" className="font-semibold">Avisos a {cliente.split(" ")[0]}</h2>

      <div className="flex items-start gap-2.5">
        <MessageCircle size={17} strokeWidth={1.8} className="mt-0.5 shrink-0 text-gray-500" />
        <div className="min-w-0 flex-1 space-y-1">
          <p><b>WhatsApp</b> · {!wa ? <span className="text-texto-2">no tiene un teléfono válido cargado</span> : waAuto ? <span className="text-ok">se le avisa solo en cada paso</span> : <span className="text-texto-2">automático apagado: avisale vos</span>}</p>
          {wa && !waAuto && !["entregado", "cancelado"].includes(estado) && (
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className="boton-sec min-h-9 px-3"><MessageCircle size={15} /> Escribirle por WhatsApp</a>
          )}
          {wa && !waAuto && puedeConectar && <p className="text-xs text-texto-2">Con la API de WhatsApp conectada, los avisos salen solos. <Link href="/admin/integraciones/whatsapp" className="font-semibold text-marca">Conectarla</Link></p>}
        </div>
      </div>

      <div className="flex items-start gap-2.5 border-t border-borde pt-3">
        <Mail size={17} strokeWidth={1.8} className="mt-0.5 shrink-0 text-gray-500" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p><b>Mail</b> · {!email ? <span className="text-texto-2">el cliente no tiene email cargado</span> : mailListo ? <span className="text-ok">se le avisa solo ({email})</span> : <span className="text-alerta">el correo no está conectado: no se manda</span>}</p>
          {email && !mailListo && <p className="text-xs text-texto-2">{mailMotivo} {puedeConectar && <Link href="/admin/integraciones/correo" className="font-semibold text-marca">Conectar el correo</Link>}</p>}
          {envios.length > 0 && (
            <ul className="space-y-1">
              {envios.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  {m.estado === "enviado" ? <CircleCheck size={13} className="text-ok" /> : m.estado === "error" ? <TriangleAlert size={13} className="text-error" /> : <Clock size={13} className="text-alerta" />}
                  <span className="font-medium">{NOMBRE[m.clave] ?? m.clave}</span><span className="text-texto-2">{fechaHora(m.creado_en)}</span>
                  {m.estado !== "enviado" && <span className={m.estado === "error" ? "text-error" : "text-alerta"}>{m.estado === "error" ? "no se pudo" : "pendiente"}{m.error ? `: ${m.error}` : ""}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-texto-2">El comprobante <span className="font-mono">{comprobante}</span> viaja en PDF cuando se acredita el pago. Los textos se cambian en <Link href="/admin/tienda/mails" className="font-semibold text-marca">Mails al cliente</Link>.</p>
        </div>
      </div>
    </section>
  );
}
