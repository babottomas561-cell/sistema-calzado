// Mails al cliente: una plantilla por situación (confirmar cuenta, bienvenida, pedido recibido, pagado, listo, enviado…) que el dueño edita, prende y apaga, ve
// cómo queda y se manda de prueba. Abajo, lo último que salió (y lo que falló). Sin el correo conectado (Integraciones → Correo) los mails no salen.
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { fechaHora } from "@/lib/formato";
import Plantillas, { type Plantilla } from "./Plantillas";

export default async function PaginaMails() {
  const { supabase, permisos } = await exigir("tienda.editar");
  const [{ data: plantillas }, { data: correo }, { data: cola }] = await Promise.all([
    supabase.from("plantillas_mail").select("clave, grupo, nombre, cuando, asunto, titulo, texto, boton, pie, activa, fija, con_pdf").order("grupo").order("clave"),
    supabase.rpc("comprobante_mail_disponible"),
    supabase.from("mails_cola").select("id, creado_en, clave, para, estado, intentos, error").order("id", { ascending: false }).limit(12),
  ]);
  const c = correo as { disponible?: boolean; motivo?: string } | null;
  const ORDEN = ["confirmacion", "recuperar", "cambio_email", "invitacion", "bienvenida", "pedido_recibido", "pedido_pagado", "pedido_confirmado", "pedido_listo", "pedido_enviado", "pedido_entregado", "pedido_cancelado"];
  const lista = ((plantillas ?? []) as Plantilla[]).sort((a, b) => ORDEN.indexOf(a.clave) - ORDEN.indexOf(b.clave));
  const nombres = Object.fromEntries(lista.map((p) => [p.clave, p.nombre]));
  const problemas = (cola ?? []).filter((m) => m.estado !== "enviado").length;
  return (
    <div className="max-w-5xl space-y-5">
      <Volver href="/admin/tienda">Tienda online</Volver>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Mails al cliente</h1>
        <p className="text-sm text-texto-2">Lo que le llega al cliente por mail cuando crea su cuenta, hace un pedido o paga. Cambiá los textos, apagá los que no quieras y mandate una prueba para ver cómo llegan.</p>
      </div>
      {!c?.disponible && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><CircleAlert size={17} className="mt-0.5 shrink-0" />
          <span><b>Los mails de pedidos todavía no salen.</b> {c?.motivo ?? "Falta conectar el correo."}{puede(permisos, "equipo.administrar") && <> <Link href="/admin/integraciones/correo" className="font-semibold underline">Conectar el correo</Link>.</>}</span></p>
      )}
      <Plantillas plantillas={lista} correoListo={!!c?.disponible} />
      {(cola ?? []).length > 0 && (
        <section className="tarjeta space-y-2" aria-labelledby="ultimos">
          <h2 id="ultimos" className="font-semibold">Lo último que salió {problemas > 0 && <span className="text-sm font-normal text-alerta">· {problemas} sin enviar</span>}</h2>
          <ul className="divide-y divide-gray-100 text-sm">
            {(cola ?? []).map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                <span><b>{nombres[m.clave] ?? m.clave}</b> <span className="text-texto-2">· {m.para} · {fechaHora(m.creado_en)}</span></span>
                <span className={`chip ${m.estado === "enviado" ? "bg-green-50 text-ok" : m.estado === "error" ? "bg-red-50 text-error" : "bg-amber-50 text-alerta"}`}>
                  {m.estado === "enviado" ? "Enviado" : m.estado === "error" ? "No se pudo" : `Pendiente${m.intentos ? ` (intento ${m.intentos})` : ""}`}</span>
                {m.error && m.estado !== "enviado" && <span className="w-full text-xs text-error">{m.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
