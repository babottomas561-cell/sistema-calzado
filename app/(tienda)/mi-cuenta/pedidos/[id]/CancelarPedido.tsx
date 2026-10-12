"use client";
// Cancelar el pedido desde Mi cuenta: un link discreto que abre una confirmación (no se cancela de un toque).
import { useActionState, useRef } from "react";
import { X } from "lucide-react";
import { MOTIVOS_CLIENTE } from "@/lib/estados-pedido";
import { cancelarMiPedido } from "../../acciones";

export default function CancelarPedido({ pedido, comprobante }: { pedido: number; comprobante: string }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, accion, cancelando] = useActionState(cancelarMiPedido, {});
  return (
    <>
      <button type="button" onClick={() => dialogo.current?.showModal()}
        className="inline-flex min-h-11 items-center text-sm font-semibold text-error underline underline-offset-4">Cancelar pedido</button>
      <dialog ref={dialogo} aria-labelledby="cancelar-t" className="m-auto w-[calc(100%-2rem)] max-w-md rounded-sm border border-borde p-0 backdrop:bg-black/40">
        <form action={accion} className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id="cancelar-t" className="text-xl font-extrabold tracking-[-0.02em]">¿Cancelar el pedido {comprobante}?</h2>
            <button type="button" onClick={() => dialogo.current?.close()} aria-label="Cerrar" className="grid h-11 w-11 shrink-0 place-items-center rounded-sm hover:bg-marca-suave"><X size={20} /></button>
          </div>
          <p className="text-texto-2">Dejamos de guardarte los productos y vuelven a estar a la venta. No se puede deshacer.</p>
          <input type="hidden" name="pedido_id" value={pedido} />
          <fieldset className="space-y-2">
            <legend className="etiqueta">¿Por qué lo cancelás?</legend>
            {Object.entries(MOTIVOS_CLIENTE).map(([valor, texto], i) => (
              <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-borde px-3 has-[:checked]:border-marca">
                <input type="radio" name="motivo" value={valor} defaultChecked={i === 0} /> {texto}</label>
            ))}
          </fieldset>
          <textarea name="comentario" rows={2} maxLength={300} placeholder="Si querés, contanos algo más (opcional)" className="campo" aria-label="Comentario" />
          {estado.error && <p className="text-sm text-error">{estado.error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => dialogo.current?.close()} className="boton-sec">No, seguir con el pedido</button>
            <button className="boton bg-error hover:bg-red-800" disabled={cancelando}>{cancelando ? "Cancelando…" : "Sí, cancelar"}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
