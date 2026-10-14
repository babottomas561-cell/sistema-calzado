"use client";
// Qué medios de Mercado Pago ofrece la caja: por rol, por persona y por dispositivo. Gana lo más específico (dispositivo > persona > rol).
// «Heredar» no guarda nada: vale lo del nivel de arriba (si nadie dijo nada, está habilitado). Es una comodidad de la pantalla: la seguridad la hace la base.
import { useEffect, useState, useTransition } from "react";
import { Smartphone, Trash2 } from "lucide-react";
import { guardarPreferenciaCobro, quitarDispositivo, registrarDispositivo } from "./acciones";

const MEDIOS = [["posnet", "Posnet"], ["qr", "QR en pantalla"], ["qr_fijo", "QR del mostrador"]] as const;
const CLAVE = "dispositivo_cobro";
type Fila = { ambito: "rol" | "usuario" | "dispositivo"; ref: string; nombre: string };
export type DatosPreferencias = { roles: { id: number; nombre: string }[]; personas: { id: string; nombre: string | null }[]; dispositivos: { id: number; clave: string; nombre: string }[];
  preferencias: { ambito: string; referencia: string; medio: string; habilitado: boolean }[] };

function Tabla({ titulo, ayuda, filas, prefs, onQuitar }: { titulo: string; ayuda: string; filas: Fila[]; prefs: DatosPreferencias["preferencias"]; onQuitar?: (ref: string) => void }) {
  const [error, setError] = useState("");
  const [, empezar] = useTransition();
  const valor = (f: Fila, m: string) => { const p = prefs.find((x) => x.ambito === f.ambito && x.referencia === f.ref && x.medio === m); return p ? (p.habilitado ? "si" : "no") : ""; };
  const cambiar = (f: Fila, m: string, v: "" | "si" | "no") => empezar(async () => { const r = await guardarPreferenciaCobro(f.ambito, f.ref, m, v); setError(r.error ?? ""); });
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="text-xs text-texto-2">{ayuda}</p>
      {filas.length === 0 ? <p className="text-sm text-texto-2">Todavía no hay.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead><tr className="text-left text-xs text-texto-2"><th className="py-1 pr-2 font-medium" />{MEDIOS.map(([m, t]) => <th key={m} className="px-1 py-1 font-medium">{t}</th>)}<th /></tr></thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.ambito + f.ref} className="border-t border-borde">
                  <td className="py-1.5 pr-2 font-medium">{f.nombre}</td>
                  {MEDIOS.map(([m, t]) => (
                    <td key={m} className="px-1 py-1.5">
                      <select aria-label={`${f.nombre}: ${t}`} value={valor(f, m)} onChange={(e) => cambiar(f, m, e.target.value as "" | "si" | "no")} className="campo h-9 w-full py-1 text-sm">
                        <option value="">Heredar</option><option value="si">Sí</option><option value="no">No</option>
                      </select>
                    </td>
                  ))}
                  <td className="py-1.5 pl-1">{onQuitar && <button type="button" onClick={() => onQuitar(f.ref)} className="text-texto-2 hover:text-error" aria-label={`Quitar ${f.nombre}`}><Trash2 size={16} strokeWidth={1.8} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
    </div>
  );
}

export default function PreferenciasCobro({ datos }: { datos: DatosPreferencias }) {
  const [mio, setMio] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const [, empezar] = useTransition();
  // El registro vive en el navegador: recién se puede leer del lado del cliente
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { try { setMio(localStorage.getItem(CLAVE)); } catch { /* sin almacenamiento */ } }, []);
  const esteAparato = datos.dispositivos.find((d) => d.clave === mio);

  const registrar = () => empezar(async () => {
    const r = await registrarDispositivo(nombre);
    if (r.error || !r.clave) { setError(r.error ?? "No se pudo registrar"); return; }
    try { localStorage.setItem(CLAVE, r.clave); setMio(r.clave); } catch { setError("Este navegador no deja guardar el registro (modo privado)"); return; }
    setNombre(""); setError("");
  });
  const quitar = (ref: string) => empezar(async () => {
    const d = datos.dispositivos.find((x) => String(x.id) === ref);
    const r = await quitarDispositivo(Number(ref));
    if (r.error) { setError(r.error); return; }
    if (d && d.clave === mio) { try { localStorage.removeItem(CLAVE); } catch { /* nada */ } setMio(null); }
  });

  return (
    <div className="space-y-6 px-5 py-4">
      <div>
        <p className="font-semibold">Cobro en la caja: qué se ofrece y a quién</p>
        <p className="text-sm text-texto-2">Elegí qué medios de Mercado Pago aparecen en la caja. Gana lo más específico: <b>dispositivo</b>, después <b>persona</b>, después <b>rol</b>. «Heredar» usa lo del nivel de arriba; si nadie dijo nada, está habilitado.</p>
      </div>
      <Tabla titulo="Por rol" ayuda="Por ejemplo, que el Vendedor no pueda cobrar con QR." filas={datos.roles.map((r) => ({ ambito: "rol" as const, ref: String(r.id), nombre: r.nombre }))} prefs={datos.preferencias} />
      <Tabla titulo="Por persona" ayuda="Para una excepción de alguien en particular." filas={datos.personas.map((p) => ({ ambito: "usuario" as const, ref: p.id, nombre: p.nombre ?? "Sin nombre" }))} prefs={datos.preferencias} />
      <Tabla titulo="Por dispositivo" ayuda="Cada aparato (la tablet del mostrador, tu celular) se registra una vez, entrando desde ese aparato." filas={datos.dispositivos.map((d) => ({ ambito: "dispositivo" as const, ref: String(d.id), nombre: d.nombre + (d.clave === mio ? " (este aparato)" : "") }))} prefs={datos.preferencias} onQuitar={quitar} />
      <div className="space-y-2 rounded-lg border border-borde p-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><Smartphone size={16} strokeWidth={1.8} /> {esteAparato ? `Este aparato está registrado como «${esteAparato.nombre}»` : "Registrar este aparato"}</p>
        {!esteAparato && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1"><label className="etiqueta" htmlFor="disp-nombre">Nombre</label><input id="disp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Caja del mostrador" className="campo" maxLength={60} /></div>
            <button type="button" className="boton" onClick={registrar} disabled={!nombre.trim()}>Registrar</button>
          </div>
        )}
        <p className="text-xs text-texto-2">El navegador recuerda el registro. Si se borran los datos del navegador, hay que registrarlo de nuevo.</p>
        {error && <p className="text-sm text-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}
