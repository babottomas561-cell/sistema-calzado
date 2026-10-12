"use client";
// Formularios chicos del crédito con proveedores: descontarlo de una factura ya cargada, y ajustarlo a mano.
import { useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { pesos } from "@/lib/formato";
import { aplicarCredito, ajustarCredito } from "./acciones";

export function AplicarCredito({ compra, maximo, saldo }: { compra: number; maximo: number; saldo: number }) {
  const [estado, accion, guardando] = useActionState(aplicarCredito, {});
  return (
    <form action={accion} className="space-y-2 rounded-lg bg-green-50 p-3 text-sm">
      <p>Tenés <b>{pesos(saldo)}</b> de crédito a favor con este proveedor.</p>
      <input type="hidden" name="compra_id" value={compra} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
          <input name="monto" type="number" min={1} max={maximo} step="0.01" defaultValue={maximo} className="campo pl-7" aria-label="Monto a descontar" /></div>
        <button className="boton" disabled={guardando}>{guardando ? "Descontando…" : "Descontar de esta factura"}</button>
      </div>
      {estado.error && <p className="text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
    </form>
  );
}

export function AjustarCredito({ proveedor }: { proveedor: number }) {
  const [estado, accion, guardando] = useActionState(ajustarCredito, {});
  return (
    <form action={accion} className="space-y-2 border-t border-borde pt-3 text-sm">
      <input type="hidden" name="proveedor_id" value={proveedor} />
      <div className="grid grid-cols-[7rem_1fr] gap-2">
        <select name="signo" className="campo"><option value="menos">Restar</option><option value="mas">Sumar</option></select>
        <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
          <input name="monto" type="number" min={1} step="0.01" required className="campo pl-7" aria-label="Monto del ajuste" /></div>
      </div>
      <input name="nota" required maxLength={200} placeholder="Por qué (no lo reconoció, lo devolvió en efectivo, nota de crédito…)" className="campo" aria-label="Nota del ajuste" />
      {estado.error && <p className="text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
      <button className="boton-sec py-2" disabled={guardando}>{guardando ? "Guardando…" : "Ajustar crédito"}</button>
    </form>
  );
}
