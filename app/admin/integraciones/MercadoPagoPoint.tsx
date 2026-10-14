"use client";
// Mercado Pago Point en Integraciones: las credenciales de la app presencial, los posnets de la cuenta y la regla de tarjetas de la caja.
import { useActionState, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Check, Copy, Search, Smartphone } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { buscarPosnets, guardarPoint, guardarReglaTarjetas, probarPoint, usarPosnet } from "./acciones";

export type EstadoPoint = {
  token: string | null; secreto: string | null; compartido?: boolean; tarjetas_modo: string;
  cuenta: { ok: boolean; fecha: string; usuario?: string; nombre?: string; error?: string } | null;
  terminales: { id: number; terminal_id: string; nombre: string | null; modo: string | null; por_defecto: boolean }[];
  cobros_mes: { aprobados: number; cobrado: number };
};

function Aviso({ estado }: { estado: { error?: string; ok?: string } }) {
  if (estado.error) return <p className="text-sm text-error" role="alert">{estado.error}</p>;
  if (estado.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>;
  return null;
}

function Copiar({ texto }: { texto: string }) {
  const [listo, setListo] = useState(false);
  return <button type="button" onClick={() => { navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}
    className="boton-sec shrink-0 px-2.5 py-1.5" aria-label="Copiar">{listo ? <Check size={15} /> : <Copy size={15} strokeWidth={1.8} />}</button>;
}

function Clave({ nombre, etiqueta, cargada, ayuda, quitar }: { nombre: string; etiqueta: string; cargada: string | null; ayuda: string; quitar: string }) {
  return (
    <div>
      <label className="etiqueta flex items-center justify-between gap-2" htmlFor={nombre}>{etiqueta}
        {cargada ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> Cargada {cargada}</span>
          : <span className="text-xs font-normal text-alerta">Sin cargar</span>}</label>
      <input id={nombre} name={nombre} type="password" autoComplete="off" placeholder={cargada ? "Dejalo vacío para no cambiarla" : ""} className="campo" />
      <p className="mt-0.5 text-[11px] text-texto-2">{ayuda}</p>
      {cargada && <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-texto-2"><input type="checkbox" name="quitar" value={quitar} /> Quitarla</label>}
    </div>
  );
}

function Posnet({ t }: { t: EstadoPoint["terminales"][number] }) {
  const [estado, accion, cargando] = useActionState(usarPosnet, {});
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2 rounded-lg border border-borde p-3">
      <input type="hidden" name="terminal" value={t.id} />
      <div className="min-w-40 flex-1">
        <label className="etiqueta" htmlFor={`posnet-${t.id}`}>Nombre</label>
        <input id={`posnet-${t.id}`} name="nombre" defaultValue={t.nombre ?? ""} placeholder="Posnet del mostrador" className="campo" />
        <p className="mt-0.5 break-all text-[11px] text-texto-2">{t.terminal_id} · {t.modo === "PDV" ? "modo punto de venta" : "todavía no está en modo punto de venta"}</p>
      </div>
      <button className={t.por_defecto ? "boton-sec" : "boton"} disabled={cargando}>{cargando ? "Preparando…" : t.por_defecto ? "Guardar nombre" : "Usar este"}</button>
      {t.por_defecto && <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok"><CircleCheck size={13} /> El de la caja</span>}
      <div className="w-full"><Aviso estado={estado} /></div>
    </form>
  );
}

export default function MercadoPagoPoint({ estado, webhook }: { estado: EstadoPoint; webhook: string }) {
  const [guardado, guardar, guardando] = useActionState(guardarPoint, {});
  const [regla, guardarRegla, guardandoRegla] = useActionState(guardarReglaTarjetas, {});
  const [prueba, setPrueba] = useState<{ error?: string; ok?: string }>({});
  const [busqueda, setBusqueda] = useState<{ error?: string; ok?: string }>({});
  const [probando, probar] = useTransition();
  const [buscando, buscar] = useTransition();
  const c = estado.cuenta;
  const hayPosnet = estado.terminales.some((t) => t.por_defecto);
  return (
    <div className="space-y-5 px-5 py-4">
      {c?.ok ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={16} /> Conectado a la cuenta {c.usuario}{c.nombre ? ` (${c.nombre})` : ""} · probado {fechaHora(c.fecha)}</p>
      ) : c ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-3 text-sm text-error"><CircleAlert size={16} /> No conecta: {c.error}</p>
      ) : <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} /> Point: falta configurar</p>}

      <form action={guardar} className="space-y-3">
        <p className="text-sm text-texto-2">{estado.compartido ? "Point usa la misma aplicación que la tienda online: no hace falta cargar nada acá." : "Si Point usa otra aplicación que la tienda online, cargá acá sus credenciales. Si es la misma, dejalo vacío."}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Clave nombre="point_token" etiqueta="Access Token" cargada={estado.token} quitar="point_token"
            ayuda="Tus integraciones → la aplicación presencial → Credenciales de producción. Empieza con APP_USR-." />
          <Clave nombre="point_secreto" etiqueta="Clave secreta de las notificaciones" cargada={estado.secreto} quitar="point_secreto"
            ayuda="Misma aplicación → Webhooks → Configurar notificaciones → «Clave secreta» (aparece al guardar la URL)." />
        </div>
        <div><span className="etiqueta">URL para las notificaciones (Webhooks: eventos «Order (Mercado Pago)» y «Pagos»)</span>
          <div className="flex gap-2"><input readOnly value={webhook} className="campo font-mono text-xs" aria-label="URL de notificaciones de Point" /><Copiar texto={webhook} /></div></div>
        <Aviso estado={guardado} />
        <div className="flex flex-wrap items-center gap-2">
          <button className="boton" disabled={guardando}>{guardando ? "Guardando…" : "Guardar Point"}</button>
          <button type="button" className="boton-sec" disabled={probando || !estado.token} onClick={() => probar(async () => setPrueba(await probarPoint()))}>{probando ? "Probando…" : "Probar conexión"}</button>
          <Aviso estado={prueba} />
        </div>
      </form>

      <div className="space-y-3 rounded-lg border border-borde p-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} strokeWidth={1.8} /> Posnet de la caja</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="boton-sec" disabled={buscando || !estado.token} onClick={() => buscar(async () => setBusqueda(await buscarPosnets()))}>
            <Search size={15} strokeWidth={1.8} /> {buscando ? "Buscando…" : "Buscar mis posnets"}</button>
          <Aviso estado={busqueda} />
        </div>
        {estado.terminales.map((t) => <Posnet key={t.id} t={t} />)}
        {!estado.terminales.length && <p className="text-sm text-texto-2">Cuando cargues el token, tocá «Buscar mis posnets».</p>}
      </div>

      <form action={guardarRegla} className="space-y-3 rounded-lg border border-borde p-3">
        <p className="text-sm font-semibold">Cobro con tarjeta en la caja</p>
        <fieldset className="space-y-1.5 text-sm">
          {[["libre", "Libre", "La tarjeta se anota a mano, como siempre. El posnet es una ayuda opcional."],
            ["vinculado", "Solo con el posnet", "No se confirma una venta con tarjeta si el cobro no pasó por el posnet de Mercado Pago."]].map(([v, t, d]) => (
            <label key={v} className="flex items-start gap-2"><input type="radio" name="tarjetas_modo" value={v} defaultChecked={estado.tarjetas_modo === v} className="mt-1" />
              <span><b>{t}</b> <span className="text-texto-2">— {d}</span></span></label>
          ))}
        </fieldset>
        {!hayPosnet && <p className="text-xs text-texto-2">Para exigir el posnet, primero elegí uno arriba.</p>}
        <Aviso estado={regla} />
        <button className="boton-sec" disabled={guardandoRegla}>{guardandoRegla ? "Guardando…" : "Guardar regla"}</button>
      </form>

      <p className="text-xs text-texto-2">Este mes: {estado.cobros_mes.aprobados} cobros con posnet · {pesos(estado.cobros_mes.cobrado)}.</p>
    </div>
  );
}
