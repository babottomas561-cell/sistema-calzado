"use client";
// Anular la venta del día: un botón discreto que abre una confirmación con el motivo.
// Explica antes qué va a pasar (stock, pedido, presupuesto), porque no se deshace.
import { useActionState, useRef } from "react";
import { Ban, X } from "lucide-react";
import { MOTIVOS_ANULACION } from "@/lib/ventas";
import { anularVenta } from "../acciones";

export default function AnularVenta({ venta, comprobante, dePedido, dePresupuesto }: { venta: number; comprobante: string; dePedido: boolean; dePresupuesto: boolean }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, accion, anulando] = useActionState(anularVenta, {});
  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-error hover:bg-red-50">
        <Ban size={16} /> Anular venta</button>
      <dialog ref={dialogo} className="m-auto w-[calc(100%-1.5rem)] max-w-md rounded-2xl border border-borde p-0 shadow-xl backdrop:bg-gray-900/40 backdrop:backdrop-blur-[2px]">
        <form action={accion}>
          <div className="flex items-center justify-between border-b border-borde px-5 py-4">
            <h3 className="font-semibold">Anular la venta {comprobante}</h3>
            <button type="button" onClick={() => dialogo.current?.close()} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Cerrar"><X size={17} /></button>
          </div>
          <div className="space-y-4 px-5 py-4">
            <ul className="list-disc space-y-1 rounded-lg bg-amber-50 py-2.5 pl-8 pr-3 text-sm text-gray-700">
              <li>Todo el stock vuelve al depósito.</li>
              <li>La venta queda <b>anulada</b> con su número y deja de contar en informes y en el total del día.</li>
              {dePedido && <li>El pedido vuelve a estar listo para entregar (o se cancela, si el cliente se arrepintió).</li>}
              {dePresupuesto && <li>El presupuesto vuelve a estar vigente.</li>}
              <li>No se puede deshacer.</li>
            </ul>
            <input type="hidden" name="venta_id" value={venta} />
            <fieldset className="space-y-1.5">
              <legend className="etiqueta">Motivo</legend>
              {Object.entries(MOTIVOS_ANULACION).map(([valor, texto]) => (
                <label key={valor} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-borde px-3 py-2.5 text-sm has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                  <input type="radio" name="motivo" value={valor} required /> {texto}</label>
              ))}
            </fieldset>
            <textarea name="comentario" rows={2} maxLength={300} placeholder="Qué pasó (obligatorio si es «otro»)" className="campo" aria-label="Comentario" />
            {estado.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-error">{estado.error}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t border-borde bg-gray-50/70 px-5 py-3">
            <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec py-2">No, dejarla</button>
            <button className="boton bg-error py-2 hover:bg-red-700" disabled={anulando}>{anulando ? "Anulando…" : "Sí, anular"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
