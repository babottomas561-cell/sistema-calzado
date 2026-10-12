"use client";
// Las secciones de la portada en el orden en que se ven: subir/bajar, prender/apagar, editar,
// borrar y agregar nuevas. Pensado para el celular: todo con botones grandes, nada de arrastrar.
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { INFO_TIPO, TIPOS, type Seccion } from "@/lib/inicio";
import { borrarSeccion, crearSeccion, mostrarSeccion, moverSeccion, type Estado } from "./acciones";
import EditorSeccion, { type Opciones } from "./EditorSeccion";

// Un resumen corto de lo que muestra cada sección, para reconocerla sin abrirla
function resumen(s: Seccion) {
  const c = s.contenido as Record<string, unknown>;
  switch (s.tipo) {
    case "cinta": return [...(c.frases as string[]), ...(c.marcas ? ["+ marcas"] : [])].join(" · ");
    case "accesos": return (c.tarjetas as { titulo: string }[]).map((t) => t.titulo).join(" · ");
    case "pasos": return (c.pasos as { titulo: string }[]).map((t) => t.titulo).join(" → ");
    case "banner": case "editorial": return s.imagen_url ? s.bajada ?? "" : "Falta la foto";
    default: return s.bajada ?? "";
  }
}

export default function ListaSecciones({ secciones, opciones }: { secciones: Seccion[]; opciones: Opciones }) {
  const [estado, setEstado] = useState<Estado>({});
  const [ocupado, empezar] = useTransition();
  const [borrando, setBorrando] = useState<number | null>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const hacer = (fn: () => Promise<Estado>) => empezar(async () => setEstado(await fn()));

  return (
    <div className="space-y-3">
      <ol className={`space-y-2 ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
        {secciones.map((s, i) => {
          const info = INFO_TIPO[s.tipo];
          return (
            <li key={s.id} className={`flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-white p-3 shadow-sm sm:flex-nowrap ${s.visible ? "" : "bg-gray-50"}`}>
              <div className="flex flex-col text-gray-500">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => hacer(() => moverSeccion(s.id, -1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-25"><ArrowUp size={16} /></button>
                <button type="button" aria-label="Bajar" disabled={i === secciones.length - 1} onClick={() => hacer(() => moverSeccion(s.id, 1))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-gray-100 disabled:opacity-25"><ArrowDown size={16} /></button>
              </div>
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${s.visible ? "bg-marca-suave text-marca" : "bg-gray-100 text-gray-400"}`}><info.icono size={18} /></span>
              <div className={`min-w-0 flex-1 basis-40 ${s.visible ? "" : "opacity-60"}`}>
                <div className="flex items-center gap-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-texto-2">{info.nombre}</span>
                  {!s.visible && <span className="chip bg-gray-200 text-[10px] text-gray-600">oculta</span>}</div>
                <p className="truncate font-semibold">{s.titulo || info.nombre}</p>
                {resumen(s) && <p className="truncate text-xs text-texto-2">{resumen(s)}</p>}
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <button type="button" onClick={() => hacer(() => mostrarSeccion(s.id, !s.visible))} title={s.visible ? "Ocultar de la tienda" : "Mostrar en la tienda"}
                  aria-label={s.visible ? "Ocultar de la tienda" : "Mostrar en la tienda"} aria-pressed={s.visible}
                  className={`grid h-10 w-10 place-items-center rounded-lg border ${s.visible ? "border-borde text-gray-600 hover:bg-gray-50" : "border-dashed border-gray-300 text-gray-400 hover:text-marca"}`}>
                  {s.visible ? <Eye size={17} /> : <EyeOff size={17} />}</button>
                <EditorSeccion key={`${s.id}-${JSON.stringify(s)}`} s={s} opciones={opciones} />
                {borrando === s.id
                  ? <button type="button" onClick={() => { setBorrando(null); hacer(() => borrarSeccion(s.id)); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-error px-3 text-sm font-semibold text-white"><Trash2 size={15} /> Borrar</button>
                  : <button type="button" onClick={() => setBorrando(s.id)} aria-label="Borrar sección" title="Borrar sección" className="grid h-10 w-10 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-error"><Trash2 size={17} /></button>}
              </div>
            </li>
          );
        })}
      </ol>
      {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}

      <button type="button" onClick={() => menu.current?.showModal()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-3.5 text-sm font-semibold text-texto-2 hover:border-marca hover:text-marca">
        <Plus size={17} /> Agregar sección</button>

      <dialog ref={menu} className="m-auto w-[calc(100%-1.5rem)] max-w-lg rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
        <div className="border-b border-borde px-5 py-4"><h3 className="font-semibold">Agregar sección</h3><p className="text-xs text-texto-2">Se suma al final; después la movés con las flechas.</p></div>
        <ul className="grid max-h-[70dvh] gap-1 overflow-y-auto p-2">
          {TIPOS.map((t) => { const info = INFO_TIPO[t]; return (
            <li key={t}><button type="button" onClick={() => { menu.current?.close(); hacer(() => crearSeccion(t)); }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-marca-suave">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca"><info.icono size={17} /></span>
              <span><span className="block font-semibold">{info.nombre}</span><span className="block text-xs text-texto-2">{info.ayuda}</span></span>
            </button></li>
          ); })}
        </ul>
        <div className="border-t border-borde px-5 py-3 text-right"><button type="button" onClick={() => menu.current?.close()} className="boton-sec py-2">Cancelar</button></div>
      </dialog>
    </div>
  );
}
