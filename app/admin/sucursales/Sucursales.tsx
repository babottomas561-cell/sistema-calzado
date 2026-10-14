"use client";
// Sucursales y cajas del sistema: cada sucursal con su depósito y su sucursal de Mercado Pago; cada caja con su caja de Mercado Pago (la del QR) y su posnet.
// Los dispositivos (tablet, celular) se asignan a una caja desde Integraciones → Mercado Pago → «Cobro en la caja».
import { useActionState, useState, useTransition } from "react";
import { CircleCheck, Link2, Plus, QrCode, Search, Store } from "lucide-react";
import { buscarSucursalesQr, type SucursalMp } from "../integraciones/acciones";
import { crearCajaMp, crearSucursalMp, desvincularCajaMp, guardarCaja, guardarSucursal, vincularCajaMp, vincularSucursalMp, type Estado } from "./acciones";

type Caja = { id: number; nombre: string; activa: boolean; por_defecto: boolean; mp_caja_id: string | null; mp_externo: string | null; terminal_id: number | null; qr_imagen: string | null; qr_plantilla: string | null; dispositivos: string[] };
type Suc = { id: number; nombre: string; activa: boolean; por_defecto: boolean; deposito_id: number | null; deposito: string | null; mp_sucursal_id: string | null; cajas: Caja[] };
export type DatosSucursales = { sucursales: Suc[]; depositos: { id: number; nombre: string }[]; terminales: { id: number; nombre: string }[] };

const PROVINCIAS = ["Capital Federal", "Buenos Aires", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes", "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones", "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe", "Santiago del Estero", "Tierra del Fuego", "Tucumán"];
const Mensaje = ({ a }: { a: Estado }) => a.error ? <p className="text-sm text-error" role="alert">{a.error}</p> : a.ok ? <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {a.ok}</p> : null;

function FormSucursal({ s, depositos }: { s?: Suc; depositos: DatosSucursales["depositos"] }) {
  const [e, accion, cargando] = useActionState(guardarSucursal, {});
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="min-w-40 flex-1"><label className="etiqueta" htmlFor={`sn-${s?.id ?? "n"}`}>Nombre</label><input id={`sn-${s?.id ?? "n"}`} name="nombre" defaultValue={s?.nombre ?? ""} placeholder="Sucursal Centro" className="campo" maxLength={60} /></div>
      <div className="min-w-40"><label className="etiqueta" htmlFor={`sd-${s?.id ?? "n"}`}>Depósito</label>
        <select id={`sd-${s?.id ?? "n"}`} name="deposito" defaultValue={s?.deposito_id ?? ""} className="campo"><option value="">—</option>{depositos.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></div>
      {s && !s.por_defecto && <label className="flex items-center gap-1.5 pb-2 text-sm"><input type="checkbox" defaultChecked={s.activa} onChange={(ev) => { const h = ev.currentTarget.form?.querySelector<HTMLInputElement>("input[name=activa]"); if (h) h.value = ev.currentTarget.checked ? "si" : "no"; }} /> Activa</label>}
      <input type="hidden" name="activa" defaultValue={s?.activa === false ? "no" : "si"} />
      <button className="boton-sec" disabled={cargando}>{cargando ? "Guardando…" : s ? "Guardar" : <><Plus size={15} /> Agregar sucursal</>}</button>
      <div className="w-full"><Mensaje a={e} /></div>
    </form>
  );
}

function FormCaja({ c, sucursal, terminales }: { c?: Caja; sucursal: number; terminales: DatosSucursales["terminales"] }) {
  const [e, accion, cargando] = useActionState(guardarCaja, {});
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      {c && <input type="hidden" name="id" value={c.id} />}<input type="hidden" name="sucursal" value={sucursal} />
      <div className="min-w-36 flex-1"><label className="etiqueta" htmlFor={`cn-${c?.id ?? `n${sucursal}`}`}>Caja</label><input id={`cn-${c?.id ?? `n${sucursal}`}`} name="nombre" defaultValue={c?.nombre ?? ""} placeholder="Caja del mostrador" className="campo" maxLength={60} /></div>
      <div className="min-w-36"><label className="etiqueta" htmlFor={`ct-${c?.id ?? `n${sucursal}`}`}>Posnet</label>
        <select id={`ct-${c?.id ?? `n${sucursal}`}`} name="terminal" defaultValue={c?.terminal_id ?? ""} className="campo"><option value="">El de siempre</option>{terminales.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
      <input type="hidden" name="activa" value="si" />
      <button className="boton-sec" disabled={cargando}>{cargando ? "Guardando…" : c ? "Guardar" : <><Plus size={15} /> Agregar caja</>}</button>
      <div className="w-full"><Mensaje a={e} /></div>
    </form>
  );
}

export default function Sucursales({ datos }: { datos: DatosSucursales }) {
  const [mpLista, setMpLista] = useState<SucursalMp[] | null>(null);
  const [aviso, setAviso] = useState<Estado>({});
  const [busca, buscar] = useTransition();
  const [trabajando, trabajar] = useTransition();
  const traer = () => buscar(async () => { const r = await buscarSucursalesQr(); setAviso(r.error ? { error: r.error } : {}); setMpLista(r.sucursales ?? null); });
  const hacer = (fn: () => Promise<Estado>) => trabajar(async () => setAviso(await fn()));
  const yaVinculadas = new Set(datos.sucursales.map((s) => s.mp_sucursal_id).filter(Boolean));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="boton-sec" onClick={traer} disabled={busca}><Search size={15} strokeWidth={1.8} /> {busca ? "Buscando…" : "Traer mis sucursales y cajas de Mercado Pago"}</button>
        <p className="text-xs text-texto-2">Para vincular, primero traé lo que ya tenés en Mercado Pago.</p>
      </div>
      <Mensaje a={aviso} />

      {datos.sucursales.map((s) => {
        const mpSuc = mpLista?.find((m) => m.id === s.mp_sucursal_id);
        return (
          <section key={s.id} className={`tarjeta space-y-4 ${s.activa ? "" : "opacity-70"}`}>
            <div className="flex items-center gap-2"><Store size={17} strokeWidth={1.8} /><h2 className="font-semibold">{s.nombre}</h2>{s.por_defecto && <span className="chip bg-gray-100 text-texto-2">principal</span>}</div>
            <FormSucursal s={s} depositos={datos.depositos} />

            <div className="space-y-2 rounded-lg bg-gray-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold"><Link2 size={15} /> Sucursal de Mercado Pago</p>
              {s.mp_sucursal_id ? (
                <p className="flex flex-wrap items-center gap-2 text-sm"><CircleCheck size={15} className="text-ok" /> Vinculada{mpSuc ? `: ${mpSuc.nombre}` : ` (n.º ${s.mp_sucursal_id})`}
                  <button type="button" className="text-xs underline" disabled={trabajando} onClick={() => hacer(() => vincularSucursalMp(s.id, ""))}>Desvincular</button></p>
              ) : (
                <div className="space-y-2">
                  {mpLista && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select id={`mps-${s.id}`} aria-label="Sucursal de Mercado Pago" defaultValue="" className="campo w-auto min-w-48">
                        <option value="" disabled>Elegí una sucursal de Mercado Pago</option>
                        {mpLista.filter((m) => !yaVinculadas.has(m.id)).map((m) => <option key={m.id} value={m.id}>{m.nombre}{m.direccion ? ` · ${m.direccion}` : ""}</option>)}
                      </select>
                      <button type="button" className="boton-sec" disabled={trabajando} onClick={() => { const v = (document.getElementById(`mps-${s.id}`) as HTMLSelectElement).value; if (v) hacer(() => vincularSucursalMp(s.id, v)); }}>Vincular</button>
                    </div>
                  )}
                  <CrearSucursalMp sucursal={s.id} />
                </div>
              )}
            </div>

            <div className="space-y-3">
              {s.cajas.map((c) => (
                <div key={c.id} className="space-y-3 rounded-lg border border-borde p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">{c.nombre}{c.por_defecto && <span className="chip bg-gray-100 font-normal text-texto-2">principal</span>}
                    {c.dispositivos.length > 0 && <span className="text-xs font-normal text-texto-2">· {c.dispositivos.join(", ")}</span>}</div>
                  <FormCaja c={c} sucursal={s.id} terminales={datos.terminales} />
                  <div className="space-y-2 rounded-lg bg-gray-50 p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold"><QrCode size={15} /> Caja de Mercado Pago (QR)</p>
                    {c.mp_externo ? (
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="flex items-center gap-1.5"><CircleCheck size={15} className="text-ok" /> Vinculada ({c.mp_externo})</span>
                        {c.qr_plantilla && <a href={c.qr_plantilla} target="_blank" rel="noreferrer" className="font-medium text-marca">QR fijo para imprimir</a>}
                        <button type="button" className="text-xs underline" disabled={trabajando} onClick={() => hacer(() => desvincularCajaMp(c.id))}>Desvincular</button>
                      </div>
                    ) : !s.mp_sucursal_id ? <p className="text-xs text-texto-2">Primero vinculá la sucursal con Mercado Pago.</p> : (
                      <div className="flex flex-wrap items-center gap-2">
                        {mpSuc && mpSuc.cajas.length > 0 && (<>
                          <select id={`mpc-${c.id}`} aria-label="Caja de Mercado Pago" defaultValue="" className="campo w-auto min-w-48"><option value="" disabled>Elegí una caja de Mercado Pago</option>
                            {mpSuc.cajas.map((m) => <option key={m.id} value={`${m.id}|${m.externo ?? ""}`}>{m.nombre}{m.externo ? ` (${m.externo})` : " (sin identificador)"}</option>)}</select>
                          <button type="button" className="boton-sec" disabled={trabajando} onClick={() => { const v = (document.getElementById(`mpc-${c.id}`) as HTMLSelectElement).value; if (v) { const [id, ext] = v.split("|"); hacer(() => vincularCajaMp(c.id, id, ext)); } }}>Vincular</button>
                          <span className="text-xs text-texto-2">o</span></>)}
                        <button type="button" className="boton-sec" disabled={trabajando} onClick={() => hacer(() => crearCajaMp(c.id))}>Crear una caja en Mercado Pago</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border border-dashed border-borde p-3"><FormCaja sucursal={s.id} terminales={datos.terminales} /></div>
            </div>
          </section>
        );
      })}

      <section className="tarjeta space-y-2"><h2 className="font-semibold">Nueva sucursal</h2><FormSucursal depositos={datos.depositos} /></section>
    </div>
  );
}

function CrearSucursalMp({ sucursal }: { sucursal: number }) {
  const [e, accion, cargando] = useActionState(crearSucursalMp, {});
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-marca">Crear la sucursal en Mercado Pago</summary>
      <form action={accion} className="mt-2 space-y-2">
        <input type="hidden" name="sucursal" value={sucursal} />
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor={`c-${sucursal}`}>Calle</label><input id={`c-${sucursal}`} name="calle" className="campo" autoComplete="off" /></div>
          <div><label className="etiqueta" htmlFor={`n-${sucursal}`}>Número</label><input id={`n-${sucursal}`} name="numero" className="campo" inputMode="numeric" autoComplete="off" /></div>
          <div><label className="etiqueta" htmlFor={`ci-${sucursal}`}>Ciudad</label><input id={`ci-${sucursal}`} name="ciudad" className="campo" autoComplete="off" /></div>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor={`p-${sucursal}`}>Provincia</label>
            <select id={`p-${sucursal}`} name="provincia" className="campo" defaultValue=""><option value="" disabled>Elegí la provincia</option>{PROVINCIAS.map((p) => <option key={p}>{p}</option>)}</select></div>
        </div>
        <Mensaje a={e} />
        <button className="boton-sec" disabled={cargando}>{cargando ? "Creando…" : "Crear y vincular"}</button>
      </form>
    </details>
  );
}
