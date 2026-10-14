"use client";
// Lo que se hace en la cuenta de un cliente: habilitarla (con su tope), cobrar una deuda y ajustarla.
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { ajustarCuenta, cobrarDeuda, habilitarCuenta, type Estado } from "../acciones";

function Aviso({ e }: { e: Estado }) {
  if (e.error) return <p className="text-sm text-error" role="alert">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {e.ok}</p>;
  return null;
}

export default function Operaciones({ cliente, habilitada, tope, deuda, medios, puedeCobrar, puedeHabilitar }: {
  cliente: number; habilitada: boolean; tope: number; deuda: number; medios: { id: number; nombre: string }[]; puedeCobrar: boolean; puedeHabilitar: boolean }) {
  const [hab, habilitar, habilitando] = useActionState(habilitarCuenta, {});
  const [cob, cobrar, cobrando] = useActionState(cobrarDeuda, {});
  const [aju, ajustar, ajustando] = useActionState(ajustarCuenta, {});
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {puedeCobrar && (
        <form action={cobrar} className="tarjeta space-y-3">
          <input type="hidden" name="cliente" value={cliente} />
          <h2 className="font-semibold">Cobrar una deuda</h2>
          <div><label className="etiqueta" htmlFor="monto-cobro">Cuánto paga</label>
            <input id="monto-cobro" name="monto" inputMode="decimal" defaultValue={deuda > 0 ? String(deuda) : ""} className="campo tabular-nums" autoComplete="off" /></div>
          <div><label className="etiqueta" htmlFor="medio-cobro">Con qué paga</label>
            <select id="medio-cobro" name="medio" className="campo">{medios.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
          <div><label className="etiqueta" htmlFor="ref-cobro">N.º de operación (opcional)</label><input id="ref-cobro" name="referencia" maxLength={40} className="campo" autoComplete="off" /></div>
          <div><label className="etiqueta" htmlFor="nota-cobro">Nota (opcional)</label><input id="nota-cobro" name="nota" maxLength={120} className="campo" autoComplete="off" /></div>
          <Aviso e={cob} />
          <button className="boton" disabled={cobrando || deuda <= 0}>{cobrando ? "Registrando…" : "Registrar cobro y ver recibo"}</button>
          {deuda <= 0 && <p className="text-xs text-texto-2">No tiene deuda para cobrar.</p>}
        </form>
      )}
      <div className="space-y-4">
        {puedeHabilitar && (
          <form action={habilitar} className="tarjeta space-y-3">
            <input type="hidden" name="cliente" value={cliente} />
            <h2 className="font-semibold">Cuenta corriente del cliente</h2>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="habilitada" defaultChecked={habilitada} /> Puede comprar a cuenta</label>
            <div><label className="etiqueta" htmlFor="tope">Hasta cuánto puede deber</label>
              <input id="tope" name="tope" inputMode="decimal" defaultValue={tope > 0 ? String(tope) : ""} className="campo tabular-nums" autoComplete="off" /></div>
            <Aviso e={hab} />
            <button className="boton-sec" disabled={habilitando}>{habilitando ? "Guardando…" : "Guardar"}</button>
          </form>
        )}
        {puedeCobrar && (
          <form action={ajustar} className="tarjeta space-y-3">
            <input type="hidden" name="cliente" value={cliente} />
            <h2 className="font-semibold">Ajuste a mano</h2>
            <p className="text-xs text-texto-2">Para una deuda anterior al sistema, un error o un descuento. Con − baja la deuda. Queda anotado con el motivo.</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="etiqueta" htmlFor="monto-ajuste">Importe</label><input id="monto-ajuste" name="monto" inputMode="decimal" className="campo tabular-nums" autoComplete="off" /></div>
              <div><label className="etiqueta" htmlFor="nota-ajuste">Motivo</label><input id="nota-ajuste" name="nota" maxLength={120} className="campo" autoComplete="off" /></div>
            </div>
            <Aviso e={aju} />
            <button className="boton-sec" disabled={ajustando}>{ajustando ? "Registrando…" : "Registrar ajuste"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
