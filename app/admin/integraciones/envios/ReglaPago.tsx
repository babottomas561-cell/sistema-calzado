"use client";
// ¿Un envío sale sin pagar? Prendido (por defecto): no; hay que registrar el pago o que lo pague con Mercado Pago.
// Apagado: se permite pago contra entrega (por ejemplo, con un cadete propio que cobra).
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { guardarReglaEnvio } from "../acciones";

export default function ReglaPago({ activa }: { activa: boolean }) {
  const [estado, accion, guardando] = useActionState(guardarReglaEnvio, {});
  return (
    <form action={accion} className="space-y-2 px-5 py-4 text-sm">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" name="envio_requiere_pago" defaultChecked={activa} className="mt-0.5 h-4 w-4" />
        <span><b>Pagado antes de enviar</b> <span className="block text-texto-2">Un pedido con envío no pasa a «Enviado» hasta que esté pagado (con Mercado Pago o con un pago registrado en el pedido). Apagalo solo si a veces cobran contra entrega con un cadete propio: Uber no cobra por vos.</span></span>
      </label>
      {estado.error && <p className="text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
      <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
