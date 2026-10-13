"use client";
// El plan de cuentas como árbol: cada nivel con su sangría, las que agrupan en negrita y las que reciben movimientos con su tipo. Se agrega, se edita,
// se importa de una planilla (código; nombre; tipo) y se exporta. La base controla el árbol: el padre y el tipo salen del código.
import { useActionState, useMemo, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Download, FolderTree, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { borrarCuenta, guardarCuenta, importarPlan, type Estado } from "./acciones";

export type Cuenta = { id: number; codigo: string; nombre: string; tipo: string; padre_id: number | null; imputable: boolean; activa: boolean; clave: string | null };
export const TIPOS: Record<string, string> = { activo: "Activo", pasivo: "Pasivo", patrimonio: "Patrimonio", ingreso: "Ingreso", costo: "Costo", gasto: "Gasto" };

// Los códigos son numéricos de largo fijo: ordenar como texto alcanza
export const porCodigo = (a: { codigo: string }, b: { codigo: string }) => a.codigo.localeCompare(b.codigo);

// Nivel de un código según el formato (cuántos dígitos tiene cada nivel): el último tramo que no es todo ceros
export function nivelDe(codigo: string, mascara: number[]): number {
  let pos = 0, nivel = 0;
  mascara.forEach((m, i) => { if (/[1-9]/.test(codigo.slice(pos, pos + m))) nivel = i + 1; pos += m; });
  return nivel;
}
// «1 · 1 · 01 · 001» a partir de {1,1,2,3} (para mostrar el formato)
export const formatoDe = (mascara: number[]) => mascara.map((m) => "9".repeat(m)).join(" · ");

function Mensaje({ estado }: { estado: Estado }) {
  if (estado.ok) return <p role="status" className="flex items-start gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} className="mt-0.5 shrink-0" /> {estado.ok}</p>;
  if (estado.error) return <p role="alert" className="flex items-start gap-1.5 text-sm text-error"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {estado.error}</p>;
  return null;
}

function Formulario({ cuenta, alCerrar, mascara }: { cuenta: Partial<Cuenta> | null; alCerrar: () => void; mascara: number[] }) {
  const largo = mascara.reduce((x, y) => x + y, 0);
  const [estado, accion, guardando] = useActionState<Estado, FormData>(async (prev, f) => { const r = await guardarCuenta(prev, f); if (r.ok) alCerrar(); return r; }, {});
  const nueva = !cuenta?.id;
  return (
    <form action={accion} className="space-y-3 rounded-xl border border-marca/40 bg-marca-suave/40 p-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold">{nueva ? "Cuenta nueva" : `Editar ${cuenta?.codigo}`}</h3>
        <button type="button" onClick={alCerrar} className="grid h-9 w-9 place-items-center rounded-md text-gray-500 hover:bg-white" aria-label="Cerrar"><X size={18} /></button></div>
      {cuenta?.id && <input type="hidden" name="id" value={cuenta.id} />}
      <div className="grid gap-3 sm:grid-cols-[11rem_1fr_10rem]">
        <div><label className="etiqueta" htmlFor="c-codigo">Código</label><input id="c-codigo" name="codigo" defaultValue={cuenta?.codigo ?? ""} required inputMode="numeric" pattern={`[0-9]{${largo}}`} maxLength={largo} placeholder={"6101010".padEnd(largo, "0").slice(0, largo)} title={`${largo} números (formato ${formatoDe(mascara)})`} className="campo font-mono tabular-nums" />
          <p className="mt-0.5 text-[11px] text-texto-2">{largo} números. Los ceros del final dicen que agrupa.</p></div>
        <div><label className="etiqueta" htmlFor="c-nombre">Nombre</label><input id="c-nombre" name="nombre" defaultValue={cuenta?.nombre ?? ""} required maxLength={80} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="c-tipo">Tipo</label>
          <select id="c-tipo" name="tipo" defaultValue={cuenta?.tipo ?? "gasto"} className="campo">{Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <p className="mt-0.5 text-[11px] text-texto-2">Si cuelga de otra, toma el tipo de esa.</p></div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="imputable" defaultChecked={cuenta?.imputable ?? true} className="h-4 w-4 accent-[var(--color-marca)]" /> Recibe movimientos (si no, solo agrupa)</label>
        {!nueva && <label className="flex items-center gap-2"><input type="checkbox" name="activa" defaultChecked={cuenta?.activa ?? true} className="h-4 w-4 accent-[var(--color-marca)]" /> Activa</label>}
      </div>
      <div className="flex flex-wrap items-center gap-3"><button className="boton min-h-10" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button><Mensaje estado={estado} /></div>
    </form>
  );
}

// Una planilla con columnas código (números; si trae puntos o guiones se sacan), nombre y (opcional) tipo, separadas por ; , o tabulación; la primera fila puede ser el encabezado
export function leerPlanilla(texto: string): { codigo: string; nombre: string; tipo?: string }[] {
  return texto.split(/\r?\n/).map((l) => l.split(/[;\t]|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((x) => x.trim().replace(/^"|"$/g, "")))
    .filter((c) => /^[\d.\- ]+$/.test(c[0] ?? "") && /\d/.test(c[0] ?? "") && (c[1] ?? "").length >= 2)
    .map((c) => ({ codigo: c[0].replace(/\D/g, ""), nombre: c[1], ...(c[2] ? { tipo: c[2] } : {}) }));
}

export default function PlanCuentas({ cuentas, puedeEditar, mascara }: { cuentas: Cuenta[]; puedeEditar: boolean; mascara: number[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [editando, setEditando] = useState<Partial<Cuenta> | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [ocupado, hacer] = useTransition();
  const archivo = useRef<HTMLInputElement>(null);
  const ordenadas = useMemo(() => [...cuentas].sort(porCodigo), [cuentas]);
  const q = busqueda.trim().toLowerCase();
  const visibles = q ? ordenadas.filter((c) => c.codigo.startsWith(q) || c.nombre.toLowerCase().includes(q)) : ordenadas;

  const exportar = () => {
    const filas = ["codigo;nombre;tipo;recibe_movimientos;activa", ...ordenadas.map((c) => [c.codigo, `"${c.nombre}"`, c.tipo, c.imputable ? "si" : "no", c.activa ? "si" : "no"].join(";"))];
    const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "plan-de-cuentas.csv" }).click(); URL.revokeObjectURL(url);
  };
  const importar = (f: File) => hacer(async () => {
    const filas = leerPlanilla(await f.text());
    setEstado(filas.length ? await importarPlan(filas) : { error: "No encontré filas con código y nombre (columnas: código; nombre; tipo)" });
    if (archivo.current) archivo.current.value = "";
  });

  return (
    <section className="space-y-3" aria-labelledby="plan-titulo">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plan-titulo" className="mr-auto flex items-center gap-2 text-lg font-semibold"><FolderTree size={19} strokeWidth={1.8} /> Plan de cuentas</h2>
        <button type="button" onClick={exportar} className="boton-sec min-h-10"><Download size={16} strokeWidth={1.8} /> Exportar</button>
        {puedeEditar && <>
          <label className="boton-sec min-h-10 cursor-pointer"><Upload size={16} strokeWidth={1.8} /> {ocupado ? "Importando…" : "Importar planilla"}
            <input ref={archivo} type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(x) => { const f = x.target.files?.[0]; if (f) importar(f); }} /></label>
          <button type="button" onClick={() => setEditando({})} className="boton min-h-10"><Plus size={16} /> Cuenta nueva</button>
        </>}
      </div>
      <Mensaje estado={estado} />
      {editando && <Formulario cuenta={editando} alCerrar={() => setEditando(null)} mascara={mascara} />}
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busqueda} onChange={(x) => setBusqueda(x.target.value)} placeholder="Buscar por código o nombre" className="campo pl-9" aria-label="Buscar cuenta" />
      </div>
      <div className="overflow-hidden rounded-xl border border-borde bg-white">
        <ul className="divide-y divide-gray-100">
          {visibles.map((c) => {
            const nivel = Math.max(nivelDe(c.codigo, mascara) - 1, 0);
            return (
              <li key={c.id} className={`group flex items-center gap-3 px-4 py-2 ${c.activa ? "" : "opacity-50"}`} style={{ paddingLeft: `${1 + nivel * 1.25}rem` }}>
                <span className="w-24 shrink-0 font-mono text-sm tabular-nums text-texto-2">{c.codigo}</span>
                <span className={`min-w-0 flex-1 truncate ${c.imputable ? "" : "font-semibold"}`}>{c.nombre}</span>
                {c.clave && <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 sm:inline" title="La usa el sistema para los asientos automáticos">del sistema</span>}
                <span className="w-20 shrink-0 text-right text-xs text-texto-2">{c.imputable ? TIPOS[c.tipo] : "agrupa"}</span>
                {!c.activa && <span className="shrink-0 text-xs text-texto-2">inactiva</span>}
                {puedeEditar && (
                  <span className="flex shrink-0 gap-0.5">
                    <button type="button" onClick={() => setEditando(c)} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-gray-100" aria-label={`Editar ${c.codigo}`}><Pencil size={15} strokeWidth={1.8} /></button>
                    {!c.clave && <button type="button" onClick={() => hacer(async () => setEstado(await borrarCuenta(c.id)))} className="grid h-8 w-8 place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-error" aria-label={`Borrar ${c.codigo}`}><Trash2 size={15} strokeWidth={1.8} /></button>}
                  </span>
                )}
              </li>
            );
          })}
          {visibles.length === 0 && <li className="px-4 py-6 text-center text-sm text-texto-2">No hay cuentas con «{busqueda}».</li>}
        </ul>
      </div>
      {puedeEditar && <p className="text-xs text-texto-2">Para importar: una planilla (CSV) con las columnas código; nombre; tipo (el tipo es opcional: si falta, sale del primer número: 1 activo, 2 pasivo, 3 patrimonio, 4 ingreso, 5 costo, 6 gasto). Los códigos tienen que respetar el formato ({formatoDe(mascara)}). Agrega y renombra; no borra nada.</p>}
    </section>
  );
}
