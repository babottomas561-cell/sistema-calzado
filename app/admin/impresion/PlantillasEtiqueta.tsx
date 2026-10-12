"use client";
// Plantillas de etiquetas: se elige la que se usa y se crean o ajustan las demás con una vista previa en vivo del tamaño real.
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, Copy, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import Etiqueta from "@/components/Etiqueta";
import { codigoPropio } from "@/lib/codigos";
import { cabeEnLaPagina, MEDIDAS_COMUNES, type DatoEtiqueta, type Plantilla } from "@/lib/etiquetas";
import { borrarPlantilla, duplicarPlantilla, guardarPlantilla, usarPlantilla, type Estado } from "./acciones";

// Todo como texto mientras se escribe (así se pueden tipear decimales); se convierte para la vista previa y al guardar
type Form = {
  id: number | null; nombre: string; tipo: "rollo" | "hoja"; pagina: "A4" | "Carta"; ancho_mm: string; alto_mm: string; columnas: string; filas: string;
  margen_superior_mm: string; margen_izquierdo_mm: string; separacion_h_mm: string; separacion_v_mm: string;
  mostrar_tienda: boolean; mostrar_nombre: boolean; mostrar_marca: boolean; mostrar_talle_color: boolean; mostrar_precio: boolean; mostrar_codigo: boolean;
  tamano_texto: string; tamano_precio: string; tipo_codigo: "auto" | "code128"; alto_codigo_mm: string;
};

const deForm = (p: Plantilla | null): Form => ({
  id: p?.id ?? null, nombre: p?.nombre ?? "", tipo: p?.tipo ?? "rollo", pagina: p?.pagina ?? "A4",
  ancho_mm: String(p?.ancho_mm ?? 50), alto_mm: String(p?.alto_mm ?? 30), columnas: String(p?.columnas ?? 1), filas: String(p?.filas ?? 1),
  margen_superior_mm: String(p?.margen_superior_mm ?? 0), margen_izquierdo_mm: String(p?.margen_izquierdo_mm ?? 0), separacion_h_mm: String(p?.separacion_h_mm ?? 0), separacion_v_mm: String(p?.separacion_v_mm ?? 0),
  mostrar_tienda: p?.mostrar_tienda ?? false, mostrar_nombre: p?.mostrar_nombre ?? true, mostrar_marca: p?.mostrar_marca ?? false, mostrar_talle_color: p?.mostrar_talle_color ?? true,
  mostrar_precio: p?.mostrar_precio ?? true, mostrar_codigo: p?.mostrar_codigo ?? true,
  tamano_texto: String(p?.tamano_texto ?? 7), tamano_precio: String(p?.tamano_precio ?? 11), tipo_codigo: p?.tipo_codigo ?? "auto", alto_codigo_mm: String(p?.alto_codigo_mm ?? 9),
});
const n = (s: string, vacio = 0) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) ? v : vacio; };
const aPlantilla = (f: Form): Plantilla => ({
  id: f.id ?? 0, nombre: f.nombre, tipo: f.tipo, pagina: f.tipo === "hoja" ? f.pagina : null, ancho_mm: n(f.ancho_mm, 50), alto_mm: n(f.alto_mm, 30), columnas: Math.max(1, Math.round(n(f.columnas, 1))),
  filas: f.tipo === "hoja" ? Math.max(1, Math.round(n(f.filas, 1))) : 1, margen_superior_mm: f.tipo === "hoja" ? n(f.margen_superior_mm) : 0, margen_izquierdo_mm: f.tipo === "hoja" ? n(f.margen_izquierdo_mm) : 0,
  separacion_h_mm: n(f.separacion_h_mm), separacion_v_mm: f.tipo === "hoja" ? n(f.separacion_v_mm) : 0,
  mostrar_tienda: f.mostrar_tienda, mostrar_nombre: f.mostrar_nombre, mostrar_marca: f.mostrar_marca, mostrar_talle_color: f.mostrar_talle_color, mostrar_precio: f.mostrar_precio, mostrar_codigo: f.mostrar_codigo,
  tamano_texto: n(f.tamano_texto, 7), tamano_precio: n(f.tamano_precio, 11), tipo_codigo: f.tipo_codigo, alto_codigo_mm: n(f.alto_codigo_mm, 9),
});

const resumen = (p: Plantilla) => p.tipo === "hoja"
  ? `Hoja ${p.pagina} · ${p.columnas} × ${p.filas} = ${p.columnas * p.filas} por hoja · etiquetas de ${p.ancho_mm} × ${p.alto_mm} mm`
  : `Rollo · ${p.columnas > 1 ? `${p.columnas} en fila · ` : ""}etiquetas de ${p.ancho_mm} × ${p.alto_mm} mm`;

function Campo({ nombre, etiqueta, valor, alCambiar, ayuda, paso = "0.1" }: { nombre: string; etiqueta: string; valor: string; alCambiar: (v: string) => void; ayuda?: string; paso?: string }) {
  return (
    <div><label className="etiqueta" htmlFor={`e-${nombre}`}>{etiqueta}</label>
      <input id={`e-${nombre}`} name={nombre} type="number" inputMode="decimal" step={paso} min={0} value={valor} onChange={(e) => alCambiar(e.target.value)} className="campo" />
      {ayuda && <p className="mt-0.5 text-[11px] text-texto-2">{ayuda}</p>}</div>
  );
}

function Editor({ inicial, tienda, alCerrar }: { inicial: Plantilla | null; tienda: string; alCerrar: () => void }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState<Form>(() => deForm(inicial));
  const [estado, accion, guardando] = useActionState(async (prev: Estado, datos: FormData) => { const r = await guardarPlantilla(prev, datos); if (r.ok) alCerrar(); return r; }, {});
  useEffect(() => { dialogo.current?.showModal(); }, []);
  const poner = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const p = aPlantilla(f);
  const falla = cabeEnLaPagina(p);
  const hoja = f.tipo === "hoja";
  const ejemplo: DatoEtiqueta = { tienda, nombre: "Camisa lino manga larga", marca: "Marca", talle: "M", color: "Blanco", precio: 38900, codigo: codigoPropio(1), sku: null };
  const zoom = Math.min(3, 300 / (p.ancho_mm * 3.78));

  const aplicarMedida = (indice: string) => {
    const m = MEDIDAS_COMUNES[Number(indice)];
    if (!m) return;
    setF((x) => ({ ...x, tipo: m.tipo, pagina: m.pagina ?? x.pagina, ancho_mm: String(m.ancho_mm), alto_mm: String(m.alto_mm), columnas: String(m.columnas), filas: String(m.filas),
      margen_superior_mm: String(m.margen_superior_mm), margen_izquierdo_mm: String(m.margen_izquierdo_mm), separacion_h_mm: String(m.separacion_h_mm), separacion_v_mm: String(m.separacion_v_mm),
      nombre: x.nombre || m.nombre }));
  };
  const interruptor = (k: "mostrar_tienda" | "mostrar_nombre" | "mostrar_marca" | "mostrar_talle_color" | "mostrar_precio" | "mostrar_codigo", texto: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} checked={f[k]} onChange={(e) => poner(k, e.target.checked)} /> {texto}</label>
  );

  return (
    <dialog ref={dialogo} onClose={alCerrar} className="m-auto max-h-[94dvh] w-[calc(100%-1rem)] max-w-4xl rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
      <form action={accion} className="flex max-h-[94dvh] flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
          <h2 className="flex items-center gap-2 font-semibold"><Tag size={18} className="text-marca" /> {f.id ? "Ajustar plantilla" : "Plantilla nueva"}</h2>
          <button type="button" onClick={() => dialogo.current?.close()} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label="Cerrar"><X size={18} /></button>
        </div>
        <input type="hidden" name="id" value={f.id ?? ""} />
        <div className="grid gap-5 overflow-y-auto px-5 py-4 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div><label className="etiqueta" htmlFor="e-nombre">Nombre</label>
              <input id="e-nombre" name="nombre" value={f.nombre} onChange={(e) => poner("nombre", e.target.value)} maxLength={60} placeholder="Rollo 50 × 30 mm" className="campo" /></div>

            <fieldset className="space-y-3">
              <legend className="font-semibold">Medidas</legend>
              <div className="flex flex-wrap gap-2">
                {(["rollo", "hoja"] as const).map((t) => (
                  <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${f.tipo === t ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde"}`}>
                    <input type="radio" name="tipo" value={t} checked={f.tipo === t} onChange={() => poner("tipo", t)} className="sr-only" />{t === "rollo" ? "Rollo (impresora térmica)" : "Hoja de etiquetas"}</label>
                ))}
                {hoja && (
                  <select name="pagina" value={f.pagina} onChange={(e) => poner("pagina", e.target.value as "A4" | "Carta")} className="campo !w-auto" aria-label="Tamaño de la hoja">
                    <option value="A4">Hoja A4</option><option value="Carta">Hoja Carta</option></select>
                )}
              </div>
              <div><label className="etiqueta" htmlFor="e-comunes">Medidas comunes</label>
                <select id="e-comunes" defaultValue="" onChange={(e) => aplicarMedida(e.target.value)} className="campo">
                  <option value="">Elegí una para completar las medidas…</option>
                  {MEDIDAS_COMUNES.map((m, i) => <option key={m.nombre} value={i}>{m.nombre} mm</option>)}</select></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo nombre="ancho_mm" etiqueta="Ancho (mm)" valor={f.ancho_mm} alCambiar={(v) => poner("ancho_mm", v)} ayuda="De cada etiqueta" />
                <Campo nombre="alto_mm" etiqueta="Alto (mm)" valor={f.alto_mm} alCambiar={(v) => poner("alto_mm", v)} ayuda="De cada etiqueta" />
                <Campo nombre="columnas" etiqueta="Columnas" valor={f.columnas} alCambiar={(v) => poner("columnas", v)} paso="1" ayuda={hoja ? "Etiquetas a lo ancho" : "Una al lado de otra"} />
                {hoja && <Campo nombre="filas" etiqueta="Filas" valor={f.filas} alCambiar={(v) => poner("filas", v)} paso="1" ayuda="Etiquetas a lo alto" />}
              </div>
              {(hoja || n(f.columnas, 1) > 1) && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {hoja && <Campo nombre="margen_superior_mm" etiqueta="Margen de arriba (mm)" valor={f.margen_superior_mm} alCambiar={(v) => poner("margen_superior_mm", v)} />}
                  {hoja && <Campo nombre="margen_izquierdo_mm" etiqueta="Margen izquierdo (mm)" valor={f.margen_izquierdo_mm} alCambiar={(v) => poner("margen_izquierdo_mm", v)} />}
                  <Campo nombre="separacion_h_mm" etiqueta="Espacio entre columnas (mm)" valor={f.separacion_h_mm} alCambiar={(v) => poner("separacion_h_mm", v)} />
                  {hoja && <Campo nombre="separacion_v_mm" etiqueta="Espacio entre filas (mm)" valor={f.separacion_v_mm} alCambiar={(v) => poner("separacion_v_mm", v)} />}
                </div>
              )}
              {falla && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {falla}</p>}
              <p className="text-xs text-texto-2">Medí una etiqueta con regla (sin el espacio entre etiquetas). En una hoja de etiquetas, el fabricante suele traer las medidas en el paquete.</p>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="font-semibold">Qué lleva</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {interruptor("mostrar_nombre", "Nombre del artículo")}{interruptor("mostrar_marca", "Marca")}
                {interruptor("mostrar_talle_color", "Talle y color")}{interruptor("mostrar_precio", "Precio")}
                {interruptor("mostrar_tienda", "Nombre de la tienda")}{interruptor("mostrar_codigo", "Número del código, debajo de las barras")}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo nombre="tamano_texto" etiqueta="Letra (pt)" valor={f.tamano_texto} alCambiar={(v) => poner("tamano_texto", v)} />
                <Campo nombre="tamano_precio" etiqueta="Precio (pt)" valor={f.tamano_precio} alCambiar={(v) => poner("tamano_precio", v)} />
                <Campo nombre="alto_codigo_mm" etiqueta="Alto del código (mm)" valor={f.alto_codigo_mm} alCambiar={(v) => poner("alto_codigo_mm", v)} />
                <div><label className="etiqueta" htmlFor="e-tipo-codigo">Código</label>
                  <select id="e-tipo-codigo" name="tipo_codigo" value={f.tipo_codigo} onChange={(e) => poner("tipo_codigo", e.target.value as "auto" | "code128")} className="campo">
                    <option value="auto">Automático</option><option value="code128">Siempre Code 128</option></select></div>
              </div>
              <p className="text-xs text-texto-2">Automático dibuja cada código en su formato (EAN-13, EAN-8, UPC-A) y los demás en Code 128: es lo que lee cualquier lector.</p>
            </fieldset>
          </div>

          <aside className="space-y-2 md:sticky md:top-0 md:self-start">
            <p className="font-semibold">Vista previa</p>
            <div className="grid place-items-center overflow-hidden rounded-xl bg-gray-100 p-4">
              <div className="bg-white shadow ring-1 ring-black/10" style={{ zoom }}><Etiqueta t={p} d={ejemplo} /></div>
            </div>
            <p className="text-xs text-texto-2">{p.ancho_mm} × {p.alto_mm} mm, tamaño real (ampliado en pantalla). Con datos de ejemplo.</p>
          </aside>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde bg-gray-50/70 px-5 py-3">
          <p className="text-sm" role="status">{estado.error && <span className="text-error">{estado.error}</span>}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec py-2">Cancelar</button>
            <button className="boton py-2" disabled={guardando || !!falla}>{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}

export default function PlantillasEtiqueta({ plantillas, enUso, tienda }: { plantillas: Plantilla[]; enUso: number | null; tienda: string }) {
  const [editando, setEditando] = useState<{ plantilla: Plantilla | null; clave: number } | null>(null);
  const [aviso, setAviso] = useState<Estado>({});
  const [ocupado, hacer] = useTransition();
  const [borrando, setBorrando] = useState<number | null>(null);
  const correr = (fn: () => Promise<Estado>) => hacer(async () => setAviso(await fn()));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Plantillas de etiquetas</h2><p className="text-sm text-texto-2">La que está «en uso» es la que se propone al imprimir; en cada tanda se puede elegir otra.</p></div>
        <button type="button" className="boton" onClick={() => setEditando({ plantilla: null, clave: Date.now() })}><Plus size={16} /> Plantilla nueva</button>
      </div>
      {aviso.error && <p className="flex items-start gap-1.5 text-sm text-error" role="alert"><CircleAlert size={15} className="mt-0.5 shrink-0" /> {aviso.error}</p>}
      {aviso.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {aviso.ok}</p>}

      <ul className={`grid gap-3 sm:grid-cols-2 ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
        {plantillas.map((p) => (
          <li key={p.id} className={`tarjeta space-y-3 ${p.id === enUso ? "border-marca ring-1 ring-marca" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="truncate font-semibold">{p.nombre}</p><p className="text-xs text-texto-2">{resumen(p)}</p></div>
              {p.id === enUso && <span className="chip shrink-0 bg-marca-suave text-marca">En uso</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {p.id !== enUso && <button type="button" className="boton-sec py-1.5" onClick={() => correr(() => usarPlantilla(p.id))}>Usar esta</button>}
              <button type="button" className="boton-sec py-1.5" onClick={() => setEditando({ plantilla: p, clave: Date.now() })}><Pencil size={14} strokeWidth={1.8} /> Ajustar</button>
              <button type="button" className="boton-sec py-1.5" onClick={() => correr(() => duplicarPlantilla(p.id))} aria-label={`Duplicar ${p.nombre}`}><Copy size={14} strokeWidth={1.8} /></button>
              {borrando === p.id
                ? <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-error px-3 py-1.5 text-sm font-semibold text-white" onClick={() => { setBorrando(null); correr(() => borrarPlantilla(p.id)); }}><Trash2 size={14} /> Borrar</button>
                : <button type="button" onClick={() => setBorrando(p.id)} aria-label={`Borrar ${p.nombre}`} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-red-50 hover:text-error"><Trash2 size={15} /></button>}
            </div>
          </li>
        ))}
        {plantillas.length === 0 && <li className="tarjeta text-sm text-texto-2 sm:col-span-2">No hay plantillas: creá una con el botón de arriba.</li>}
      </ul>
      {editando && <Editor key={editando.clave} inicial={editando.plantilla} tienda={tienda} alCerrar={() => setEditando(null)} />}
    </section>
  );
}
