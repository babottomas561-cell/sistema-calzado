"use client";
import { useActionState, useState } from "react";
import { CircleCheck } from "lucide-react";
import { pesos } from "@/lib/formato";
import { ajusteDe, textoMedio, type MedioPago } from "@/lib/medios";
import { cambiarEstado } from "../acciones";
import { ESTADOS } from "@/lib/estados-pedido";

// Avanzar el pedido. Al entregarlo se cobra: por defecto con el medio que eligió el cliente y con el %
// que tenía ese medio al hacer el pedido (se respeta el precio prometido aunque después haya cambiado).
export default function Acciones({ pedido, siguientes, medios, elegido, subtotal }: {
  pedido: number; siguientes: string[]; medios: MedioPago[]; elegido: { id: number; ajuste_pct: number }; subtotal: number;
}) {
  const [estado, accion, cargando] = useActionState(cambiarEstado, {});
  const [destino, setDestino] = useState(siguientes[0]);
  const [medio, setMedio] = useState(elegido.id);
  const pct = medio === elegido.id ? elegido.ajuste_pct : Number(medios.find((m) => m.id === medio)?.ajuste_pct ?? 0);
  const aCobrar = subtotal + ajusteDe(subtotal, pct);

  return (
    <form action={accion} className="tarjeta space-y-3">
      <h2 className="font-semibold">Actualizar pedido</h2>
      <input type="hidden" name="pedido_id" value={pedido} />
      <div className="flex flex-wrap gap-2">
        {siguientes.map((s) => (
          <button key={s} type="button" onClick={() => setDestino(s)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${destino === s ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{ESTADOS[s].texto}</button>
        ))}
      </div>
      <input type="hidden" name="estado" value={destino} />
      <input name="comentario" placeholder={destino === "enviado" ? "Ej.: sale por Andreani, n.º de seguimiento…" : "Comentario para el cliente (opcional)"} className="campo" />
      {destino === "entregado" && (
        <div className="space-y-1 rounded-lg bg-gray-50 p-2">
          <label className="text-xs text-texto-2">Cobrado con
            <select name="medio_pago_id" value={medio} onChange={(e) => setMedio(Number(e.target.value))} className="campo mt-0.5">
              {medios.map((m) => <option key={m.id} value={m.id}>{m.id === elegido.id ? `${m.nombre} (el que eligió)` : textoMedio(m)}</option>)}
            </select></label>
          <input type="hidden" name="cambio_medio" value={medio === elegido.id ? "" : "1"} />
          <p className="text-sm">Se cobra <b>{pesos(aCobrar)}</b></p>
          <p className="text-xs text-texto-2">Al marcarlo entregado se registra la venta y se descuenta el stock.</p>
        </div>
      )}
      {destino === "cancelado" && <p className="text-xs text-error">Al cancelar se libera el stock reservado.</p>}
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className={destino === "cancelado" ? "boton w-full bg-error hover:bg-red-700" : "boton w-full"} disabled={cargando}>
        {cargando ? "Guardando…" : `Pasar a «${ESTADOS[destino].texto}»`}
      </button>
    </form>
  );
}
