"use client";
// Un asiento a mano: renglones con su cuenta y su importe en el debe o en el haber. Muestra la diferencia en vivo y no deja guardar hasta que cuadre.
import { useMemo, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Plus, Trash2 } from "lucide-react";
import { pesos } from "@/lib/formato";
import { asientoManual, type Estado } from "./acciones";
import { porCodigo, type Cuenta } from "./PlanCuentas";

type Fila = { cuenta: string; debe: string; haber: string };
const vacia = (): Fila => ({ cuenta: "", debe: "", haber: "" });
const num = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;

export default function AsientoManual({ cuentas, hoy }: { cuentas: Cuenta[]; hoy: string }) {
  const [fecha, setFecha] = useState(hoy);
  const [concepto, setConcepto] = useState("");
  const [filas, setFilas] = useState<Fila[]>([vacia(), vacia()]);
  const [estado, setEstado] = useState<Estado>({});
  const [guardando, hacer] = useTransition();
  const opciones = useMemo(() => cuentas.filter((c) => c.imputable && c.activa).sort(porCodigo), [cuentas]);
  const debe = filas.reduce((s, f) => s + num(f.debe), 0), haber = filas.reduce((s, f) => s + num(f.haber), 0);
  const cuadra = Math.abs(debe - haber) < 0.005 && debe > 0;
  const poner = (i: number, cambio: Partial<Fila>) => setFilas((fs) => fs.map((f, j) => (j === i ? { ...f, ...cambio } : f)));

  const guardar = () => hacer(async () => {
    const lineas = filas.filter((f) => f.cuenta && (num(f.debe) > 0 || num(f.haber) > 0)).map((f) => ({ cuenta: Number(f.cuenta), debe: num(f.debe), haber: num(f.haber) }));
    const r = await asientoManual(fecha, concepto, lineas);
    setEstado(r);
    if (r.ok) { setConcepto(""); setFilas([vacia(), vacia()]); }
  });

  return (
    <section className="tarjeta space-y-3" aria-labelledby="manual-titulo">
      <div><h3 id="manual-titulo" className="font-semibold">Asiento manual</h3><p className="text-sm text-texto-2">Para lo que el sistema no arma solo: completar la apertura, un ajuste del contador, un cierre.</p></div>
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div><label className="etiqueta" htmlFor="m-fecha">Fecha</label><input id="m-fecha" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="campo h-10" /></div>
        <div><label className="etiqueta" htmlFor="m-concepto">De qué es</label><input id="m-concepto" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={120} placeholder="Saldo inicial de caja y bancos" className="campo h-10" /></div>
      </div>
      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_8rem_8rem_2.5rem] gap-2 text-xs font-semibold text-texto-2 sm:grid"><span>Cuenta</span><span className="text-right">Debe</span><span className="text-right">Haber</span><span /></div>
        {filas.map((f, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_2.5rem]">
            <select value={f.cuenta} onChange={(e) => poner(i, { cuenta: e.target.value })} className="campo h-10 py-1.5 text-sm" aria-label={`Cuenta del renglón ${i + 1}`}>
              <option value="">Elegí la cuenta…</option>{opciones.map((c) => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}</select>
            <input value={f.debe} inputMode="decimal" placeholder="Debe" onChange={(e) => poner(i, { debe: e.target.value, haber: e.target.value ? "" : f.haber })} className="campo h-10 text-right tabular-nums" aria-label={`Debe del renglón ${i + 1}`} />
            <input value={f.haber} inputMode="decimal" placeholder="Haber" onChange={(e) => poner(i, { haber: e.target.value, debe: e.target.value ? "" : f.debe })} className="campo h-10 text-right tabular-nums" aria-label={`Haber del renglón ${i + 1}`} />
            <button type="button" onClick={() => setFilas((fs) => (fs.length > 2 ? fs.filter((_, j) => j !== i) : fs))} disabled={filas.length <= 2} className="grid h-10 w-10 place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-error disabled:opacity-30" aria-label="Quitar el renglón"><Trash2 size={16} strokeWidth={1.8} /></button>
          </div>
        ))}
        <button type="button" onClick={() => setFilas((fs) => [...fs, vacia()])} className="inline-flex items-center gap-1 text-sm font-medium text-marca"><Plus size={15} /> Otro renglón</button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-borde pt-3 text-sm">
        <span>Debe <b className="tabular-nums">{pesos(debe)}</b></span><span>Haber <b className="tabular-nums">{pesos(haber)}</b></span>
        <span className={cuadra ? "font-semibold text-ok" : "text-texto-2"}>{cuadra ? "Cuadra" : `Diferencia ${pesos(Math.abs(debe - haber))}`}</span>
        <button type="button" onClick={guardar} disabled={!cuadra || !concepto.trim() || guardando} className="boton ml-auto min-h-10">{guardando ? "Guardando…" : "Registrar asiento"}</button>
      </div>
      {estado.ok && <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      {estado.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-error"><CircleAlert size={16} /> {estado.error}</p>}
    </section>
  );
}
