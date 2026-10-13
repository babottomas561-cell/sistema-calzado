"use client";
// Correo: el local elige por dónde salen sus mails (dominio propio con Resend, el Gmail del local u otro servidor), ve qué quedó aplicado en Supabase y prueba.
import { useActionState, useState, useTransition } from "react";
import { AtSign, CircleAlert, CircleCheck, Globe, Mail, Send, Server } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { modoDe, SERVIDORES, type ModoCorreo } from "@/lib/correo";
import { guardarCorreo, probarCorreo } from "../acciones";

export type EstadoCorreo = { smtp: boolean; host: string | null; puerto: number | null; usuario: string | null; clave: string | null; email: string | null;
  nombre: string | null; nombre_tienda: string; conexion: boolean; sitio: boolean; aplicado_en: string | null; error: string | null };

function Aviso({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e.ok) return <p className="flex items-start gap-1.5 text-sm text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> {e.ok}</p>;
  return null;
}

const OPCIONES: { modo: ModoCorreo; titulo: string; texto: string; etiqueta: string; Icono: typeof Globe }[] = [
  { modo: "dominio", titulo: "Con el dominio de mi tienda", texto: "Los mails salen con tu marca, por ejemplo no-responder@mitienda.com.ar. Necesitás un dominio propio.", etiqueta: "Lo más profesional", Icono: Globe },
  { modo: "gmail", titulo: "Con el Gmail del local", texto: "No necesitás dominio. Los mails salen desde el Gmail del local, que Google ya reconoce, así que llegan bien.", etiqueta: "Sin dominio", Icono: AtSign },
  { modo: "otro", titulo: "Otro servidor de correo", texto: "Brevo, SendGrid, el correo de tu hosting… cualquiera que te dé un servidor SMTP.", etiqueta: "Avanzado", Icono: Server },
];

export default function Correo({ estado: e }: { estado: EstadoCorreo }) {
  const [estado, accion, cargando] = useActionState(guardarCorreo, {});
  // Sin nada guardado se propone Gmail (no necesita dominio), ya con su servidor y puerto
  const inicial: ModoCorreo = e.smtp ? modoDe(e.host) : "gmail";
  const [modo, setModo] = useState<ModoCorreo>(inicial);
  const [host, setHost] = useState(e.smtp || inicial === "otro" ? (e.host ?? "") : SERVIDORES[inicial].host);
  const [puerto, setPuerto] = useState(e.smtp || inicial === "otro" ? String(e.puerto ?? "") : String(SERVIDORES[inicial].puerto));
  const [usuario, setUsuario] = useState(e.usuario ?? "");
  const [gmail, setGmail] = useState(inicial === "gmail" ? (e.usuario ?? "") : "");
  const [prueba, setPrueba] = useState<{ error?: string; ok?: string }>({});
  const [probando, probar] = useTransition();

  // Elegir otra opción cambia lo que se completa, pero no se guarda nada hasta tocar «Guardar y aplicar»
  const elegir = (m: ModoCorreo) => {
    setModo(m);
    if (m === "otro") return;
    setHost(SERVIDORES[m].host); setPuerto(String(SERVIDORES[m].puerto));
    setUsuario(m === "dominio" ? (SERVIDORES.dominio.usuario ?? "") : gmail);
  };
  const cambiarGmail = (v: string) => { setGmail(v); setUsuario(v); };
  const sinGuardar = !e.smtp || modoDe(e.host) !== modo;

  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.smtp ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>{e.smtp ? "Servidor cargado" : "Falta cargar el servidor"}</span>
        {e.aplicado_en && !e.error && <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-ok">Aplicado en Supabase · {fechaHora(e.aplicado_en)}</span>}
        {!e.conexion && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-alerta">Falta la conexión técnica</span>}
      </div>
      {e.error && <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {e.error}</p>}

      <fieldset className="space-y-2">
        <legend className="font-semibold">¿Cómo querés mandar los mails?</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {OPCIONES.map(({ modo: m, titulo, texto, etiqueta, Icono }) => (
            <label key={m} className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition ${modo === m ? "border-marca bg-marca-suave/40 ring-1 ring-marca" : "border-borde hover:bg-gray-50"}`}>
              <input type="radio" name="modo-correo" value={m} checked={modo === m} onChange={() => elegir(m)} className="sr-only" />
              <span className="flex items-center justify-between gap-2">
                <Icono size={20} strokeWidth={modo === m ? 2.2 : 1.8} className={modo === m ? "text-marca" : "text-gray-500"} />
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-700">{etiqueta}</span>
              </span>
              <span className="font-semibold">{titulo}</span>
              <span className="text-sm text-texto-2">{texto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <form action={accion} className="space-y-4">
        <input type="hidden" name="host" value={host} /><input type="hidden" name="puerto" value={puerto} /><input type="hidden" name="usuario" value={usuario} />
        {sinGuardar && <p className="rounded-lg bg-amber-50 p-3 text-sm text-alerta">Todavía no está guardado: completá los datos y tocá «Guardar y aplicar».</p>}

        {modo === "dominio" && (
          <div className="space-y-3">
            <p className="text-sm text-texto-2">Usa Resend (gratis hasta 3.000 mails por mes). Primero verificás tu dominio en resend.com y creás una clave; el paso a paso está abajo, en el manual.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="etiqueta" htmlFor="clave">API key de Resend {e.clave && modoDe(e.host) === "dominio" && <span className="font-normal text-texto-2">(cargada: {e.clave}; dejá vacío para no cambiarla)</span>}</label>
                <input id="clave" name="clave" type="password" autoComplete="new-password" placeholder="re_…" className="campo" /></div>
              <div><label className="etiqueta" htmlFor="email">Mail desde el que salen</label>
                <input id="email" name="email" type="email" defaultValue={modoDe(e.host) === "dominio" ? (e.email ?? "") : ""} placeholder="no-responder@mitienda.com.ar" className="campo" /></div>
            </div>
            <p className="text-xs text-texto-2">La dirección tiene que ser de un dominio que ya verificaste en Resend.</p>
          </div>
        )}

        {modo === "gmail" && (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-texto-2">
              <li>Entrá a <b>myaccount.google.com/security</b> con el Gmail del local y activá la <b>verificación en dos pasos</b> (sin eso Google no deja crear la clave).</li>
              <li>Entrá a <b>myaccount.google.com/apppasswords</b>, escribí un nombre (por ejemplo «Sistema») y tocá <b>Crear</b>.</li>
              <li>Google te muestra 16 letras. Copialas y pegalas acá abajo (con o sin espacios).</li>
            </ol>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="etiqueta" htmlFor="gmail">Gmail del local</label>
                <input id="gmail" name="email" type="email" value={gmail} onChange={(ev) => cambiarGmail(ev.target.value)} placeholder="milocal@gmail.com" autoComplete="off" className="campo" /></div>
              <div><label className="etiqueta" htmlFor="clave">Contraseña de aplicación {e.clave && modoDe(e.host) === "gmail" && <span className="font-normal text-texto-2">(cargada: {e.clave}; dejá vacío para no cambiarla)</span>}</label>
                <input id="clave" name="clave" type="password" autoComplete="new-password" placeholder="abcd efgh ijkl mnop" className="campo" /></div>
            </div>
            <p className="text-xs text-texto-2">Gmail deja mandar unos 500 mails por día, de sobra para un local. Los clientes ven como remitente tu Gmail; si más adelante tenés dominio, cambiás de opción acá mismo.</p>
          </div>
        )}

        {modo === "otro" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="host-otro">Servidor</label><input id="host-otro" value={host} onChange={(ev) => setHost(ev.target.value)} placeholder="smtp.miservidor.com" className="campo" /></div>
            <div><label className="etiqueta" htmlFor="puerto-otro">Puerto</label>
              <select id="puerto-otro" value={puerto} onChange={(ev) => setPuerto(ev.target.value)} className="campo"><option value="">—</option>{[465, 587, 2465, 2587, 25].map((p) => <option key={p}>{p}</option>)}</select></div>
            <div><label className="etiqueta" htmlFor="usuario-otro">Usuario</label><input id="usuario-otro" value={usuario} onChange={(ev) => setUsuario(ev.target.value)} autoComplete="off" className="campo" /></div>
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="clave">Contraseña o API key {e.clave && modoDe(e.host) === "otro" && <span className="font-normal text-texto-2">(cargada: {e.clave}; dejá vacío para no cambiarla)</span>}</label>
              <input id="clave" name="clave" type="password" autoComplete="new-password" className="campo" /></div>
            <div className="sm:col-span-3"><label className="etiqueta" htmlFor="email">Mail desde el que salen</label>
              <input id="email" name="email" type="email" defaultValue={modoDe(e.host) === "otro" ? (e.email ?? "") : ""} placeholder="no-responder@mitienda.com.ar" className="campo" /></div>
            <p className="text-xs text-texto-2 sm:col-span-3">Muchos servicios piden verificar la dirección «desde» (o su dominio) antes de dejarte mandar. Si no podés verificarla, usá la opción de Gmail.</p>
          </div>
        )}

        <div className="max-w-md"><label className="etiqueta" htmlFor="nombre">Nombre que ve el cliente</label>
          <input id="nombre" name="nombre" defaultValue={e.nombre ?? ""} placeholder={e.nombre_tienda} className="campo" />
          <p className="mt-0.5 text-xs text-texto-2">Los textos de los mails se arman solos con el nombre de la tienda ({e.nombre_tienda}).</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Guardar y aplicar"}</button>
          <Aviso e={estado} />
        </div>
      </form>

      <div className="space-y-2 border-t border-borde pt-4">
        <h2 className="flex items-center gap-2 font-semibold"><Mail size={17} strokeWidth={1.8} /> Probar</h2>
        <p className="text-sm text-texto-2">Te mandamos un mail a tu propio email por el mismo camino que usa un cliente. Si llega y se ve con el nombre de tu tienda, está todo bien.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="boton-sec" disabled={probando || !e.smtp} onClick={() => probar(async () => setPrueba(await probarCorreo()))}>
            <Send size={15} strokeWidth={1.8} /> {probando ? "Enviando…" : "Mandarme un mail de prueba"}</button>
          <Aviso e={prueba} />
        </div>
        {e.smtp && !e.sitio && <p className="text-xs text-texto-2">Tocá «Guardar y aplicar» una vez más para que los comprobantes por mail también funcionen.</p>}
      </div>
    </div>
  );
}
