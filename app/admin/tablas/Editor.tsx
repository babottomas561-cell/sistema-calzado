"use client";
// Ventana para crear o editar una fila de una tabla maestra. Los campos llegan como children
// (cada tabla tiene los suyos); acá están el guardado, el borrado con confirmación y los mensajes.
import { useActionState, useRef, useState } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { guardarMaestro, type Estado } from "./acciones";

export default function Editor({ tabla, id, titulo, enUso = 0, nuevo, disparador, children }: {
  tabla: string; id?: number; titulo: string; enUso?: number;
  nuevo?: string;                    // texto del botón "Nuevo …" (si no es una edición)
  disparador?: React.ReactNode;      // contenido propio del disparador (un chip, una fila…)
  children: React.ReactNode;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [confirmando, setConfirmando] = useState(false);
  // Si guardó bien, se cierra la ventana (la página se recarga sola con los datos nuevos)
  const [estado, accion, cargando] = useActionState(async (prev: Estado, f: FormData) => {
    const r = await guardarMaestro(prev, f);
    if (r.ok) dialogo.current?.close();
    return r;
  }, {});
  const abrir = () => { setConfirmando(false); dialogo.current?.showModal(); };

  return (
    <>
      {disparador
        ? <button type="button" onClick={abrir} className="text-left">{disparador}</button>
        : nuevo
          ? <button type="button" onClick={abrir} className="boton py-2"><Plus size={16} /> {nuevo}</button>
          : <button type="button" onClick={abrir} title={titulo} aria-label={titulo}
              className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"><Pencil size={15} /></button>}

      <dialog ref={dialogo} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
        <form action={accion}>
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <h3 className="font-semibold">{titulo}</h3>
            <button type="button" onClick={() => dialogo.current?.close()} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cerrar"><X size={17} /></button>
          </div>
          <input type="hidden" name="tabla" value={tabla} />
          {id && <input type="hidden" name="id" value={id} />}
          <div className="space-y-4 px-5 py-4">
            {children}
            {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-borde bg-gray-50/70 px-5 py-3">
            {/* Borrar: solo si no está en uso (la base igual lo frena), y con confirmación */}
            <div>{id && (enUso > 0
              ? <span className="text-xs text-texto-2">En uso en {enUso} {enUso === 1 ? "registro" : "registros"}: no se puede borrar</span>
              : confirmando
                ? <button name="_accion" value="borrar" className="inline-flex items-center gap-1.5 rounded-lg bg-error px-3 py-2 text-sm font-semibold text-white" disabled={cargando}><Trash2 size={15} /> Sí, borrar</button>
                : <button type="button" onClick={() => setConfirmando(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-error hover:bg-red-50"><Trash2 size={15} /> Borrar</button>)}</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec py-2">Cancelar</button>
              <button className="boton py-2" disabled={cargando}>{cargando ? "Guardando…" : "Guardar"}</button>
            </div>
          </div>
        </form>
      </dialog>
    </>
  );
}
