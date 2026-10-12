"use client";
// Resolver una tanda de fallados: qué pasó (se arregló, al proveedor o baja), cuántas y una nota.
import { useActionState, useRef, useState } from "react";
import { Truck, Trash2, Wrench, X } from "lucide-react";
import { resolverFallado } from "./acciones";

const SALIDAS = [
  { valor: "arreglado", texto: "Se arregló", ayuda: "Vuelve a la venta.", icono: Wrench },
  { valor: "proveedor", texto: "Se le devuelve al proveedor", ayuda: "Sale del local y queda como crédito con él, a su costo.", icono: Truck },
  { valor: "baja", texto: "Dar de baja", ayuda: "No tiene arreglo ni reclamo: cuenta como pérdida a su costo.", icono: Trash2 },
] as const;

export default function Resolver({ id, cantidad, titulo, proveedores, proveedorPrincipal }: {
  id: number; cantidad: number; titulo: string; proveedores: { id: number; nombre: string }[]; proveedorPrincipal: number | null;
}) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [salida, setSalida] = useState<string>("");
  const [estado, accion, guardando] = useActionState(async (prev: { error?: string; ok?: string }, f: FormData) => {
    const r = await resolverFallado(prev, f);
    if (r.ok) dialogo.current?.close();
    return r;
  }, {});
  return (
    <>
      <button type="button" onClick={() => { setSalida(""); dialogo.current?.showModal(); }} className="boton-sec px-3 py-2">Resolver</button>
      <dialog ref={dialogo} className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
        <form action={accion}>
          <div className="flex items-center justify-between gap-3 border-b border-borde px-5 py-4">
            <h3 className="font-semibold">{titulo}</h3>
            <button type="button" onClick={() => dialogo.current?.close()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cerrar"><X size={17} /></button>
          </div>
          <input type="hidden" name="fallado_id" value={id} />
          <div className="space-y-4 px-5 py-4">
            <fieldset className="space-y-1.5">
              <legend className="etiqueta">¿Qué pasó?</legend>
              {SALIDAS.map(({ valor, texto, ayuda, icono: Icono }) => (
                <label key={valor} className="flex cursor-pointer gap-3 rounded-lg border border-borde px-3 py-2.5 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                  <input type="radio" name="salida" value={valor} required checked={salida === valor} onChange={() => setSalida(valor)} className="mt-1" />
                  <Icono size={17} className="mt-0.5 shrink-0 text-texto-2" />
                  <span><span className="block font-semibold">{texto}</span><span className="text-xs text-texto-2">{ayuda}</span></span>
                </label>
              ))}
            </fieldset>
            {salida === "proveedor" && (
              <div><label className="etiqueta">Proveedor</label>
                <select name="proveedor_id" defaultValue={proveedorPrincipal ?? ""} required className="campo">
                  <option value="" disabled>Elegí el proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.id === proveedorPrincipal ? " (el principal)" : ""}</option>)}
                </select></div>
            )}
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <div><label className="etiqueta">Cuántas</label>
                <input name="cantidad" type="number" min={1} max={cantidad} defaultValue={cantidad} className="campo" /></div>
              <div><label className="etiqueta">Nota (opcional)</label>
                <input name="nota" maxLength={200} placeholder={salida === "proveedor" ? "N.º de reclamo, quién lo retiró…" : "Qué se hizo"} className="campo" /></div>
            </div>
            {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-borde bg-gray-50/70 px-5 py-3">
            <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec py-2">Cancelar</button>
            <button className="boton py-2" disabled={guardando}>{guardando ? "Guardando…" : "Confirmar"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
