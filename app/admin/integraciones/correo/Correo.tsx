"use client";
// Correo: datos del SMTP (Resend recomendado), estado de lo aplicado en Supabase y mail de prueba.
import { useActionState, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Send } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { guardarCorreo, probarCorreo } from "../acciones";

export type EstadoCorreo = { smtp: boolean; host: string | null; puerto: number | null; usuario: string | null; clave: string | null; email: string | null;
  nombre: string | null; nombre_tienda: string; conexion: boolean; aplicado_en: string | null; error: string | null };

function Aviso({ e }: { e: { error?: string; ok?: string } }) {
  if (e.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e.ok) return <p className="flex items-start gap-1.5 text-sm text-ok"><CircleCheck size={15} className="mt-0.5 shrink-0" /> {e.ok}</p>;
  return null;
}

export default function Correo({ estado: e }: { estado: EstadoCorreo }) {
  const [estado, accion, cargando] = useActionState(guardarCorreo, {});
  const [host, setHost] = useState(e.host ?? "");
  const [puerto, setPuerto] = useState(String(e.puerto ?? ""));
  const [usuario, setUsuario] = useState(e.usuario ?? "");
  const [prueba, setPrueba] = useState<{ error?: string; ok?: string }>({});
  const [probando, probar] = useTransition();
  const resend = () => { setHost("smtp.resend.com"); setPuerto("465"); setUsuario("resend"); };
  return (
    <div className="space-y-5 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${e.smtp ? "bg-green-50 text-ok" : "bg-amber-50 text-alerta"}`}>{e.smtp ? "Servidor cargado" : "Falta cargar el servidor"}</span>
        {e.aplicado_en && !e.error && <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-ok">Aplicado en Supabase · {fechaHora(e.aplicado_en)}</span>}
        {!e.conexion && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-alerta">Falta la conexión técnica</span>}
      </div>
      {e.error && <p className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {e.error}</p>}
      <form action={accion} className="space-y-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">Servidor de correo (SMTP)</h2>
          <button type="button" onClick={resend} className="text-sm font-semibold text-marca">Completar para Resend</button></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="host">Servidor</label><input id="host" name="host" value={host} onChange={(ev) => setHost(ev.target.value)} placeholder="smtp.resend.com" className="campo" /></div>
          <div><label className="etiqueta" htmlFor="puerto">Puerto</label>
            <select id="puerto" name="puerto" value={puerto} onChange={(ev) => setPuerto(ev.target.value)} className="campo"><option value="">—</option>{[465, 587, 2465, 2587, 25].map((p) => <option key={p}>{p}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="usuario">Usuario</label><input id="usuario" name="usuario" value={usuario} onChange={(ev) => setUsuario(ev.target.value)} placeholder="resend" autoComplete="off" className="campo" /></div>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="clave">Contraseña o API key {e.clave && <span className="font-normal text-texto-2">(cargada: {e.clave}; dejá vacío para no cambiarla)</span>}</label>
            <input id="clave" name="clave" type="password" autoComplete="new-password" placeholder={e.clave ? "••••••••" : "re_…"} className="campo" /></div>
          <div><label className="etiqueta" htmlFor="email">Mail desde el que salen</label><input id="email" name="email" type="email" defaultValue={e.email ?? ""} placeholder="no-responder@mitienda.com.ar" className="campo" /></div>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="nombre">Nombre que ve el cliente</label><input id="nombre" name="nombre" defaultValue={e.nombre ?? ""} placeholder={e.nombre_tienda} className="campo" /></div>
        </div>
        <p className="text-xs text-texto-2">La dirección «desde» tiene que ser de un dominio que verificaste en tu proveedor de correo. Los textos de los mails se arman solos con el nombre de la tienda ({e.nombre_tienda}).</p>
        <div className="flex flex-wrap items-center gap-3">
          <button className="boton" disabled={cargando}>{cargando ? "Guardando…" : "Guardar y aplicar"}</button>
          <Aviso e={estado} />
        </div>
      </form>
      <div className="space-y-2 border-t border-borde pt-4">
        <h2 className="font-semibold">Probar</h2>
        <p className="text-sm text-texto-2">Te mandamos un mail a tu propio email por el mismo camino que usa un cliente. Si llega y se ve con el nombre de tu tienda, está todo bien.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="boton-sec" disabled={probando || !e.smtp} onClick={() => probar(async () => setPrueba(await probarCorreo()))}>
            <Send size={15} strokeWidth={1.8} /> {probando ? "Enviando…" : "Mandarme un mail de prueba"}</button>
          <Aviso e={prueba} />
        </div>
      </div>
    </div>
  );
}
