"use client";
// Mandar el comprobante al cliente, a mano: por WhatsApp (se abre con el mensaje y el link ya escritos), por mail (sale desde el sistema
// por Resend) o copiando el link. Quien lo recibe lo abre en el celular y puede guardarlo como PDF. Abajo queda lo que ya se mandó.
import { useActionState, useState, useTransition } from "react";
import { Check, CircleAlert, CircleCheck, Copy, Link2, Mail, MessageCircle, RefreshCw, FileDown } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { mensajeWhatsApp, type Comprobante } from "@/lib/comprobante";
import { paraWhatsApp } from "@/lib/telefono";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { enviarPorMail, registrarEnvio, renovarEnlace, type Estado } from "../../acciones";

export type Envio = { canal: string; destino: string | null; estado: string; detalle: string | null; creado_en: string };
const CANAL = { mail: "Mail", whatsapp: "WhatsApp", enlace: "Link copiado" } as Record<string, string>;
const ICONO = { mail: Mail, whatsapp: MessageCircle, enlace: Link2 } as Record<string, typeof Mail>;

export default function EnviarComprobante({ c, tipo, id, origen, telefono, email, mail, envios }: {
  c: Comprobante; tipo: string; id: number; origen: string; telefono: string | null; email: string | null;
  mail: { disponible: boolean; motivo?: string }; envios: Envio[];
}) {
  const [ruta, setRuta] = useState(c.enlace?.ruta ?? "");
  const [urlBase, setUrlBase] = useState(c.enlace?.url ?? null);
  const url = urlBase ?? `${origen}${ruta}`;
  const [tel, setTel] = useState(telefono ?? "");
  const [correo, setCorreo] = useState(email ?? "");
  const [copiado, setCopiado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, hacer] = useTransition();
  const [estadoMail, enviarMail, enviando] = useActionState<Estado, FormData>(enviarPorMail, {});

  const numero = paraWhatsApp(tel);
  const telefonoRaro = tel.trim() !== "" && !numero;
  const wa = enlaceWhatsApp(numero, mensajeWhatsApp(c, url, pesos));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true); setAviso(null);
      setTimeout(() => setCopiado(false), 2500);
      void registrarEnvio(tipo, id, "enlace", null);
    } catch { setAviso("No se pudo copiar solo: tocá el link, seleccionalo y copialo."); }
  }
  const otroLink = () => hacer(async () => {
    const r = await renovarEnlace(tipo, id);
    setConfirmar(false);
    if (r.error || !r.enlace) { setAviso(r.error ?? "No se pudo generar otro link"); return; }
    setRuta(r.enlace.ruta ?? ""); setUrlBase(r.enlace.url ?? null); setAviso("Listo: el link anterior ya no abre el comprobante.");
  });

  const campo = "min-h-11 w-full rounded-lg border border-borde bg-white px-3 text-base sm:text-sm";
  return (
    <section className="tarjeta space-y-4 print:hidden" aria-labelledby="enviar-titulo">
      <h2 id="enviar-titulo" className="font-semibold">Mandarle el comprobante al cliente</h2>

      <div className="space-y-1.5">
        <label htmlFor="wa-tel" className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle size={16} strokeWidth={1.8} className="text-ok" /> WhatsApp</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="wa-tel" type="tel" inputMode="tel" autoComplete="off" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Teléfono del cliente (con código de área)" className={campo} />
          <a href={wa} target="_blank" rel="noopener noreferrer" onClick={() => void registrarEnvio(tipo, id, "whatsapp", numero)} className="boton min-h-11 shrink-0">
            <MessageCircle size={17} strokeWidth={1.8} /> Abrir WhatsApp</a>
        </div>
        <p className="text-xs text-texto-2">{telefonoRaro ? "Revisá el número: tiene que llevar el código de área (por ejemplo 381 555-1234). Igual podés abrir WhatsApp y elegir el contacto."
          : numero ? "Se abre WhatsApp con el mensaje y el link listos para mandar." : "Sin teléfono, WhatsApp se abre para que elijas el contacto."}</p>
      </div>

      <form action={enviarMail} className="space-y-1.5 border-t border-borde pt-4">
        <input type="hidden" name="tipo" value={tipo} /><input type="hidden" name="id" value={id} />
        <label htmlFor="mail-to" className="flex items-center gap-1.5 text-sm font-semibold"><Mail size={16} strokeWidth={1.8} className="text-marca" /> Mail</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="mail-to" name="email" type="email" autoComplete="off" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="Email del cliente" disabled={!mail.disponible} className={`${campo} disabled:bg-gray-50`} />
          <button type="submit" disabled={!mail.disponible || enviando || !correo.trim()} className="boton-sec min-h-11 shrink-0 disabled:opacity-50">
            <Mail size={17} strokeWidth={1.8} /> {enviando ? "Enviando…" : "Enviar mail"}</button>
        </div>
        {!mail.disponible && <p className="text-xs text-texto-2">{mail.motivo ?? "El mail todavía no está disponible."}</p>}
        {estadoMail.ok && <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {estadoMail.ok}</p>}
        {estadoMail.error && <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {estadoMail.error}</p>}
      </form>

      <div className="space-y-1.5 border-t border-borde pt-4">
        <label htmlFor="enlace-url" className="flex items-center gap-1.5 text-sm font-semibold"><Link2 size={16} strokeWidth={1.8} /> Link para ver o guardar el comprobante</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="enlace-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={`${campo} font-mono text-xs`} />
          <button type="button" onClick={copiar} className="boton-sec min-h-11 shrink-0">{copiado ? <><Check size={17} strokeWidth={2} /> Copiado</> : <><Copy size={17} strokeWidth={1.8} /> Copiar link</>}</button>
          <a href={`${url}/pdf`} target="_blank" rel="noopener noreferrer" className="boton-sec min-h-11 shrink-0"><FileDown size={17} strokeWidth={1.8} /> Ver el PDF</a>
        </div>
        {aviso && <p role="status" className="text-xs text-texto-2">{aviso}</p>}
        {!confirmar
          ? <button type="button" onClick={() => setConfirmar(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-texto-2 underline-offset-2 hover:underline"><RefreshCw size={13} strokeWidth={2} /> Generar otro link</button>
          : (
            <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
              <p>Con otro link, el que ya mandaste <b>deja de abrir</b> el comprobante. Hacelo si se lo mandaste a quien no era.</p>
              <div className="flex gap-2">
                <button type="button" onClick={otroLink} disabled={ocupado} className="boton min-h-10">{ocupado ? "Generando…" : "Sí, generar otro"}</button>
                <button type="button" onClick={() => setConfirmar(false)} className="boton-sec min-h-10">Cancelar</button>
              </div>
            </div>
          )}
      </div>

      {envios.length > 0 && (
        <div className="border-t border-borde pt-3">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-texto-2">Ya se mandó</h3>
          <ul className="space-y-1 text-sm">
            {envios.map((e, i) => {
              const Icono = ICONO[e.canal] ?? Link2;
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icono size={15} strokeWidth={1.8} className={`mt-0.5 shrink-0 ${e.estado === "error" ? "text-error" : "text-texto-2"}`} />
                  <span className={e.estado === "error" ? "text-error" : ""}>
                    {CANAL[e.canal] ?? e.canal}{e.destino ? ` · ${e.destino}` : ""}{e.estado === "error" ? ` · no salió${e.detalle ? `: ${e.detalle}` : ""}` : e.estado === "abierto" && e.canal === "whatsapp" ? " · se abrió" : ""}
                    <span className="text-texto-2"> · {fechaHora(e.creado_en)}</span></span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
