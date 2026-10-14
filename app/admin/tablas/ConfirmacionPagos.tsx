"use client";
// Cómo se verifica un pago recibido: el efectivo lo confirma un cajero (siempre) y la transferencia pide lo que se elija acá. Lo que paga el cliente con Mercado Pago
// se verifica solo. Se guarda al elegir.
import { useState, useTransition } from "react";
import { Banknote, CircleAlert, CircleCheck, Landmark } from "lucide-react";
import { guardarConfirmacionPagos } from "./acciones";

const OPCIONES = [
  { valor: "no", titulo: "No pedir nada", detalle: "Alcanza con anotar que llegó." },
  { valor: "referencia", titulo: "El número de operación", detalle: "Obligatorio al registrar la transferencia (y en la caja)." },
  { valor: "adjunto", titulo: "El comprobante adjunto", detalle: "Foto o PDF obligatorio al registrar la transferencia de un pedido." },
] as const;

export default function ConfirmacionPagos({ inicial, puedeEditar }: { inicial: "no" | "referencia" | "adjunto"; puedeEditar: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [res, setRes] = useState<{ error?: string; ok?: string }>({});
  const [, hacer] = useTransition();
  const elegir = (v: typeof valor) => { setValor(v); hacer(async () => setRes(await guardarConfirmacionPagos(v))); };
  return (
    <section className="tarjeta space-y-3" aria-labelledby="conf-pagos">
      <div><h3 id="conf-pagos" className="font-semibold">Cómo se verifica que llegó un pago</h3>
        <p className="text-sm text-texto-2">Para los pagos que se anotan a mano en un pedido o se cobran en la caja.</p></div>
      <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
        <div className="flex items-start gap-2.5 rounded-lg bg-gray-50 p-3 text-sm"><Banknote size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-gray-500" />
          <div><b>Efectivo</b><p className="text-texto-2">Lo confirma siempre un cajero, el que lo recibe. Hasta entonces el pedido no cuenta como pagado. (Se da con el permiso «Confirmar pagos recibidos».)</p></div></div>
        <div className="space-y-2"><p className="flex items-center gap-2 text-sm font-semibold"><Landmark size={16} strokeWidth={1.8} /> Transferencia: ¿qué hay que cargar?</p>
          <div className="grid gap-2 sm:grid-cols-3">{OPCIONES.map((o) => (
            <label key={o.valor} className={`flex flex-col gap-0.5 rounded-lg border p-3 text-sm ${puedeEditar ? "cursor-pointer" : "opacity-70"} ${valor === o.valor ? "border-marca bg-marca-suave/40 ring-1 ring-marca" : "border-borde hover:bg-gray-50"}`}>
              <input type="radio" name="transferencia" checked={valor === o.valor} disabled={!puedeEditar} onChange={() => elegir(o.valor)} className="sr-only" />
              <b>{o.titulo}</b><span className="text-xs text-texto-2">{o.detalle}</span></label>))}</div>
        </div>
      </div>
      <p className="text-xs text-texto-2">Lo que el cliente paga con Mercado Pago (en la tienda) se verifica solo: no pide ni confirma nada.</p>
      {res.ok && <p role="status" className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {res.ok}</p>}
      {res.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-error"><CircleAlert size={15} /> {res.error}</p>}
    </section>
  );
}
