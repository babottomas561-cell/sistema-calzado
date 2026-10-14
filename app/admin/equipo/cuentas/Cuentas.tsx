"use client";
// Cuentas de clientes: formulario de reglas (registro, datos que pide, contraseña, dominios, términos, confirmación)
// y las invitaciones por link. Lo que se guarda lo valida la base.
import { useActionState, useState, useTransition } from "react";
import { Check, CircleAlert, CircleCheck, Copy, Link2, MailCheck, Trash2 } from "lucide-react";
import { fecha } from "@/lib/formato";
import type { ConfigCuentas } from "@/lib/cuentas";
import { anularInvitacion, crearInvitacion, guardarCuentas } from "./acciones";

type Inv = { id: number; email: string; token: string; usada: boolean; vence_en: string; rol: string | null };

function Aviso({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e.ok) return <p className="flex items-start gap-1.5 text-sm text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> {e.ok}</p>;
  return null;
}

function Copiar({ texto, rotulo = "Copiar link" }: { texto: string; rotulo?: string }) {
  const [listo, setListo] = useState(false);
  return <button type="button" onClick={() => { navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}
    className="boton-sec !px-3 !py-1.5 text-xs">{listo ? <Check size={14} /> : <Copy size={14} strokeWidth={1.8} />} {listo ? "Copiado" : rotulo}</button>;
}

function Seccion({ titulo, texto, children }: { titulo: string; texto?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t border-borde pt-5 first:border-0 first:pt-0">
      <div><h2 className="font-semibold">{titulo}</h2>{texto && <p className="text-sm text-texto-2">{texto}</p>}</div>
      {children}
    </section>
  );
}

const MODOS = [["no", "No lo pide"], ["opcional", "Opcional"], ["obligatorio", "Obligatorio"]] as const;

function Datos({ nombre, etiqueta, valor }: { nombre: string; etiqueta: string; valor: string }) {
  return (
    <div><label className="etiqueta" htmlFor={nombre}>{etiqueta}</label>
      <select id={nombre} name={nombre} defaultValue={valor} className="campo">{MODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></div>
  );
}

function Casilla({ nombre, valor, children, ayuda }: { nombre: string; valor: boolean; children: React.ReactNode; ayuda?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={nombre} defaultChecked={valor} className="mt-0.5" />
      <span>{children}{ayuda && <span className="block text-xs text-texto-2">{ayuda}</span>}</span>
    </label>
  );
}

export default function Cuentas({ config: c, smtp, conexion, base, invitaciones, roles }: {
  config: ConfigCuentas; smtp: boolean; conexion: boolean; base: string; invitaciones: Inv[]; roles: { id: number; nombre: string }[];
}) {
  const [estado, accion, cargando] = useActionState(guardarCuentas, {});
  const [conf, setConf] = useState(c.confirmar_email);
  const [invEstado, invAccion, invCargando] = useActionState(crearInvitacion, {});
  const [, anular] = useTransition();
  const enlace = (t: string) => `${base}/registro?invitacion=${t}`;
  return (
    <div className="space-y-6">
      {conf && !smtp && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-alerta">
          <CircleAlert size={20} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Falta conectar el correo</p>
            <p>Con la confirmación de email activa, los clientes no van a recibir el mail si no hay un servidor de correo propio (Supabase solo manda mails al equipo del proyecto).
              {" "}<a href="/admin/integraciones/correo" className="font-semibold underline">Conectar el correo</a>.</p></div>
        </div>
      )}
      <form action={accion} className="tarjeta space-y-5">
        <Seccion titulo="Quién puede crear una cuenta">
          <div className="grid gap-2 sm:grid-cols-2">
            {([["abierto", "Cualquiera", "Cualquier persona puede registrarse desde la tienda."], ["invitacion", "Solo con invitación", "Se necesita el link que genera el local. Sirve para sumar al equipo o a clientes puntuales."]] as const).map(([v, t, d]) => (
              <label key={v} className="flex cursor-pointer items-start gap-2 rounded-lg border border-borde p-3 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                <input type="radio" name="registro" value={v} defaultChecked={c.registro === v} className="mt-0.5" /><span><b>{t}</b><span className="block text-xs text-texto-2">{d}</span></span></label>
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Confirmación de email" texto="El cliente recibe un mail con un link y hasta que lo toca no puede ingresar ni hacer pedidos.">
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="confirmar_email" checked={conf} onChange={(e) => setConf(e.target.checked)} className="mt-0.5" />
            <span><b>Pedir que confirme su email</b> (recomendado)
              <span className="block text-xs text-texto-2">{conf ? "Evita cuentas con emails ajenos o mal escritos, y asegura que el cliente reciba los avisos de sus pedidos."
                : "Sin confirmar, cualquiera puede crear una cuenta con el email de otra persona. Úsalo solo si todavía no hay correo conectado."}</span></span></label>
          {conf && smtp && <p className="flex items-center gap-1.5 text-xs text-ok"><MailCheck size={14} /> El correo está conectado.</p>}
        </Seccion>
        <Seccion titulo="Datos que pide el formulario" texto="Nombre, email y contraseña siempre. Cuanto menos pidas, más gente termina de registrarse.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Datos nombre="telefono" etiqueta="Teléfono (WhatsApp)" valor={c.telefono} />
            <Datos nombre="documento" etiqueta="DNI" valor={c.documento} />
            <Datos nombre="nacimiento" etiqueta="Fecha de nacimiento" valor={c.nacimiento} />
            <Datos nombre="direccion" etiqueta="Dirección" valor={c.direccion} />
          </div>
          <Casilla nombre="ofrecer_novedades" valor={c.ofrecer_novedades} ayuda="Una casilla sin tildar de entrada: solo recibe promociones quien la marca.">Ofrecer «Quiero recibir novedades y promociones»</Casilla>
        </Seccion>
        <Seccion titulo="Contraseña">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="clave_min">Largo mínimo</label><input id="clave_min" name="clave_min" type="number" min={6} max={64} defaultValue={c.clave_min} className="campo" /></div>
            <div className="space-y-2 pt-6">
              <Casilla nombre="clave_exige_mayuscula" valor={c.clave_exige_mayuscula}>Exigir una mayúscula</Casilla>
              <Casilla nombre="clave_exige_numero" valor={c.clave_exige_numero}>Exigir un número</Casilla>
            </div>
          </div>
        </Seccion>
        <Seccion titulo="Dominios de email" texto="Para frenar mails descartables, o para aceptar solo los de una empresa. Separados por espacio o coma.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="etiqueta" htmlFor="dominios_bloqueados">Bloqueados</label><textarea id="dominios_bloqueados" name="dominios_bloqueados" rows={2} placeholder="mailinator.com, yopmail.com" defaultValue={c.dominios_bloqueados.join(", ")} className="campo" /></div>
            <div><label className="etiqueta" htmlFor="dominios_permitidos">Solo estos (vacío = cualquiera)</label><textarea id="dominios_permitidos" name="dominios_permitidos" rows={2} placeholder="miempresa.com" defaultValue={c.dominios_permitidos.join(", ")} className="campo" /></div>
          </div>
        </Seccion>
        <Seccion titulo="Términos y condiciones">
          <Casilla nombre="exigir_terminos" valor={c.exigir_terminos} ayuda="Queda registrado cuándo los aceptó cada persona.">Exigir que acepte los términos para crear la cuenta</Casilla>
          <div><label className="etiqueta" htmlFor="terminos_url">Dirección donde se leen</label><input id="terminos_url" name="terminos_url" defaultValue={c.terminos_url ?? ""} placeholder="https://… o /terminos" className="campo" /></div>
        </Seccion>
        <Seccion titulo="Textos">
          <div><label className="etiqueta" htmlFor="texto_registro">Debajo del título «Crear cuenta»</label><input id="texto_registro" name="texto_registro" maxLength={200} defaultValue={c.texto_registro ?? ""} placeholder="Para hacer pedidos y seguirlos." className="campo" /></div>
          <div><label className="etiqueta" htmlFor="texto_confirmado">En «Revisá tu email»</label><input id="texto_confirmado" name="texto_confirmado" maxLength={300} defaultValue={c.texto_confirmado ?? ""} placeholder="Te mandamos un email: tocá el link para confirmar la cuenta." className="campo" /></div>
        </Seccion>
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Guardar"}</button>
          <Aviso e={estado} />
        </div>
        {!conexion && <p className="text-xs text-texto-2">La confirmación de email y la contraseña también se configuran en Supabase: hace falta una configuración que hace quien instaló el sistema (avisale) para que se apliquen solas.</p>}
      </form>

      <section className="tarjeta space-y-4">
        <div><h2 className="flex items-center gap-2 font-semibold"><Link2 size={18} strokeWidth={1.8} className="text-marca" /> Invitaciones</h2>
          <p className="text-sm text-texto-2">Un link de un solo uso, atado a un email y válido por 7 días. Con un rol, la persona entra directo al equipo; sin rol, es un cliente.</p></div>
        <form action={invAccion} className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
          <div><label className="etiqueta" htmlFor="email_inv">Email</label><input id="email_inv" name="email" type="email" required className="campo" /></div>
          <div><label className="etiqueta" htmlFor="rol_id">Entra como</label>
            <select id="rol_id" name="rol_id" className="campo"><option value="">Cliente</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></div>
          <button className="boton" disabled={invCargando}>{invCargando ? "Creando…" : "Crear invitación"}</button>
        </form>
        <Aviso e={invEstado} />
        {invEstado.enlace && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 p-3 text-xs">
            <span className="min-w-0 flex-1 break-all font-mono">{enlace(invEstado.enlace)}</span><Copiar texto={enlace(invEstado.enlace)} /></div>
        )}
        {invitaciones.length > 0 && (
          <ul className="divide-y divide-borde text-sm">
            {invitaciones.map((i) => {
              const vencida = !i.usada && new Date(i.vence_en) < new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div><span className="font-semibold">{i.email}</span> <span className="text-texto-2">· {i.rol ?? "Cliente"}</span></div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${i.usada ? "bg-green-50 text-ok" : vencida ? "bg-gray-100 text-texto-2" : "bg-amber-50 text-alerta"}`}>
                      {i.usada ? "Usada" : vencida ? "Vencida" : `Pendiente · hasta el ${fecha(i.vence_en)}`}</span>
                    {!i.usada && !vencida && <Copiar texto={enlace(i.token)} rotulo="Link" />}
                    {!i.usada && <button type="button" onClick={() => anular(async () => { await anularInvitacion(i.id); })} className="rounded p-1.5 text-texto-2 hover:bg-gray-100" aria-label={`Anular la invitación de ${i.email}`}><Trash2 size={15} strokeWidth={1.8} /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
