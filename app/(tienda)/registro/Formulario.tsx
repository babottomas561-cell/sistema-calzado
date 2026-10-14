"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CircleCheck, Eye, EyeOff, MailCheck } from "lucide-react";
import { registrarse, reenviarConfirmacion } from "../ingresar/acciones";
import { reglaClave, type ConfigCuentas, type Modo } from "@/lib/cuentas";

// Pantalla de «revisá tu email»: reenviar (con espera para no pasarse del límite de mails) o volver a escribirlo
function RevisaTuEmail({ email, mensaje, onCambiar }: { email: string; mensaje: string; onCambiar: () => void }) {
  const [estado, accion, cargando] = useActionState(reenviarConfirmacion, {});
  const [espera, setEspera] = useState(60);
  useEffect(() => { if (espera <= 0) return; const t = setTimeout(() => setEspera(espera - 1), 1000); return () => clearTimeout(t); }, [espera]);
  return (
    <div className="tarjeta mx-auto max-w-sm space-y-4 p-6 text-center">
      <MailCheck size={40} className="mx-auto text-marca" />
      <h1 className="text-xl font-bold">Revisá tu email</h1>
      <p className="text-sm text-texto-2">{mensaje}</p>
      <p className="break-all rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold">{email}</p>
      <ul className="space-y-1 text-left text-xs text-texto-2">
        <li>• Puede tardar un par de minutos. Fijate en <b>spam</b> o promociones.</li>
        <li>• El link sirve una sola vez; podés abrirlo desde el celular o la compu.</li>
        <li>• ¿Ya tenías cuenta con este email? Entonces no se manda nada: ingresá o cambiá tu contraseña.</li>
      </ul>
      <form action={accion} onSubmit={() => setEspera(60)} className="space-y-2">
        <input type="hidden" name="email" value={email} />
        <button className="boton-sec w-full" disabled={cargando || espera > 0}>
          {cargando ? "Enviando…" : espera > 0 ? `Reenviar el mail (en ${espera} s)` : "Reenviar el mail"}</button>
        {estado.ok && <p className="flex items-center justify-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
        {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      </form>
      <button type="button" onClick={onCambiar} className="text-sm font-semibold text-marca">¿Escribiste mal el email? Volver</button>
      <Link href="/olvide-clave" className="block text-sm text-texto-2">Olvidé mi contraseña</Link>
    </div>
  );
}

function Campo({ nombre, etiqueta, modo, tipo = "text", auto, v, intento, ayuda }: { nombre: string; etiqueta: string; modo: Modo; tipo?: string; auto?: string; v?: string; intento?: string; ayuda?: string }) {
  if (modo === "no") return null;
  return (
    <div>
      <label className="etiqueta" htmlFor={nombre}>{etiqueta}{modo === "opcional" && <span className="font-normal text-texto-2"> (opcional)</span>}</label>
      <input id={nombre} name={nombre} type={tipo} required={modo === "obligatorio"} autoComplete={auto} key={`${nombre}-${intento}`} defaultValue={v} className="campo" />
      {ayuda && <p className="mt-1 text-xs text-texto-2">{ayuda}</p>}
    </div>
  );
}

export default function Formulario({ config, invitacion, volver, docs }: { docs: { terminos: boolean; privacidad: boolean }; config: ConfigCuentas; invitacion: { token: string; email: string; rol: string | null } | null; volver: string }) {
  const [estado, accion, cargando] = useActionState(registrarse, {});
  const [verClave, setVerClave] = useState(false);
  const [volverAlForm, setVolverAlForm] = useState(false);
  // React vacía el formulario después de enviarlo: con la key, cada campo se vuelve a crear con lo que había escrito
  const v = estado.valores ?? {};
  if (estado.ok && !volverAlForm) return <RevisaTuEmail email={v.email ?? ""} mensaje={estado.ok} onCambiar={() => setVolverAlForm(true)} />;
  return (
    <form action={accion} onSubmit={() => setVolverAlForm(false)} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <div>
        <h1 className="text-xl font-bold">{invitacion ? "Aceptar invitación" : "Crear cuenta"}</h1>
        <p className="text-sm text-texto-2">{invitacion?.rol ? `Te sumaron como ${invitacion.rol}.` : config.texto_registro ?? "Así hacés tus pedidos y los seguís desde acá."}</p>
      </div>
      <input type="hidden" name="volver" value={volver} />
      {invitacion && <input type="hidden" name="invitacion" value={invitacion.token} />}
      <Campo nombre="nombre" etiqueta="Nombre y apellido" modo="obligatorio" auto="name" v={v.nombre} intento={v.intento} />
      <div>
        <label className="etiqueta" htmlFor="email">Email</label>
        {invitacion
          ? <input id="email" name="email" type="email" readOnly value={invitacion.email} className="campo bg-gray-50" />
          : <input id="email" name="email" type="email" required autoComplete="email" key={`email-${v.intento}`} defaultValue={v.email} className="campo" />}
        {!invitacion && <p className="mt-1 text-xs text-texto-2">{config.confirmar_email ? "Te vamos a mandar un mail para confirmarlo: revisá que esté bien escrito." : "Lo usamos para avisarte de tus pedidos."}</p>}
      </div>
      <Campo nombre="telefono" etiqueta="Teléfono (WhatsApp)" modo={config.telefono as Modo} tipo="tel" auto="tel" v={v.telefono} intento={v.intento} />
      <Campo nombre="documento" etiqueta="DNI" modo={config.documento as Modo} auto="off" v={v.documento} intento={v.intento} />
      <Campo nombre="nacimiento" etiqueta="Fecha de nacimiento" modo={config.nacimiento as Modo} tipo="date" auto="bday" v={v.nacimiento} intento={v.intento} />
      <Campo nombre="direccion" etiqueta="Dirección" modo={config.direccion as Modo} auto="street-address" v={v.direccion} intento={v.intento} />
      <div>
        <label className="etiqueta" htmlFor="clave">Contraseña</label>
        <div className="relative">
          <input id="clave" name="clave" type={verClave ? "text" : "password"} required minLength={config.clave_min} autoComplete="new-password" className="campo pr-10" />
          <button type="button" onClick={() => setVerClave(!verClave)} className="absolute inset-y-0 right-0 px-3 text-texto-2" aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}>
            {verClave ? <EyeOff size={16} strokeWidth={1.8} /> : <Eye size={16} strokeWidth={1.8} />}</button>
        </div>
        <p className="mt-1 text-xs text-texto-2">{reglaClave(config)}</p>
      </div>
      {config.exigir_terminos && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="terminos" required className="mt-0.5" />
          <span>Acepto {docs.terminos || config.terminos_url
            ? <a href={docs.terminos ? "/terminos" : config.terminos_url!} target="_blank" rel="noreferrer" className="font-semibold text-marca underline">los términos y condiciones</a> : "los términos y condiciones"}
            {docs.privacidad && <> y <a href="/privacidad" target="_blank" rel="noreferrer" className="font-semibold text-marca underline">la política de privacidad</a></>}.</span>
        </label>
      )}
      {config.ofrecer_novedades && !invitacion && (
        <label className="flex items-start gap-2 text-sm text-texto-2">
          <input type="checkbox" name="novedades" className="mt-0.5" /><span>Quiero recibir novedades y promociones.</span>
        </label>
      )}
      {estado.error && <p className="text-sm text-error" role="alert">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Creando…" : invitacion ? "Crear mi cuenta" : "Crear cuenta"}</button>
      <p className="text-center text-sm">¿Ya tenés cuenta? <Link href={`/ingresar${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`} className="font-semibold text-marca">Ingresá</Link></p>
    </form>
  );
}
