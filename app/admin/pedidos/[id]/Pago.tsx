"use client";
// El pago de un pedido: si está pagado (Mercado Pago o registrado a mano) o cuánto falta, y registrar un pago recibido
// (transferencia, efectivo en el local…). Con la regla prendida, un envío no sale sin pagar.
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { fechaHora, pesos } from "@/lib/formato";
import { registrarPago } from "../acciones";

type PagoManual = { id: number; fecha: string; monto: number; referencia: string | null };

export default function Pago({ pedido, aPagar, pagadoOnline, pagos, exigeParaEnviar, abierto }:
  { pedido: number; aPagar: number; pagadoOnline: boolean; pagos: PagoManual[]; exigeParaEnviar: boolean; abierto: boolean }) {
  const [estado, accion, guardando] = useActionState(registrarPago, {});
  const registrado = pagos.reduce((s, p) => s + p.monto, 0);
  const falta = Math.max(0, aPagar - registrado);
  const pagado = pagadoOnline || falta < 0.01;
  return (
    <section className="tarjeta space-y-2 text-sm">
      <h2 className="font-semibold">Pago</h2>
      {pagado
        ? <p className="flex items-center gap-1.5 font-semibold text-ok"><CircleCheck size={16} /> Pagado{pagadoOnline ? " con Mercado Pago" : ""}</p>
        : <p className={`flex items-center gap-1.5 font-semibold ${exigeParaEnviar ? "text-alerta" : "text-texto-2"}`}><CircleAlert size={16} />
            Falta pagar {pesos(falta)}{exigeParaEnviar ? ": no se puede enviar hasta que esté pagado" : ""}</p>}
      {pagos.length > 0 && <ul className="text-xs text-texto-2">{pagos.map((p) => (
        <li key={p.id}>{fechaHora(p.fecha)} · {pesos(p.monto)}{p.referencia ? ` · ${p.referencia}` : ""}</li>
      ))}</ul>}
      {!pagado && abierto && (
        <form action={accion} key={estado.ok ?? "pago"} className="space-y-2 border-t border-borde pt-2">
          <input type="hidden" name="pedido_id" value={pedido} />
          <div className="grid grid-cols-[8rem_1fr] gap-2">
            <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
              <input name="monto" inputMode="decimal" defaultValue={falta.toFixed(2).replace(".", ",")} className="campo pl-7" aria-label="Monto recibido" /></div>
            <input name="referencia" placeholder="N.º de transferencia, efectivo…" className="campo" aria-label="Referencia del pago" />
          </div>
          {estado.error && <p className="text-error">{estado.error}</p>}
          {estado.ok && <p className="text-ok">{estado.ok}</p>}
          <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Registrar pago recibido"}</button>
          <p className="text-xs text-texto-2">Es la constancia de que ya pagó: al entregarlo, la venta se registra con el medio del pedido, sin cobrarlo dos veces.</p>
        </form>
      )}
    </section>
  );
}
