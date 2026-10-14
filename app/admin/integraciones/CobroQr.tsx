"use client";
// Cobro con QR: se prepara una sola vez (Mercado Pago pide una sucursal y una caja con la dirección del local).
import { useActionState } from "react";
import { CircleCheck, QrCode } from "lucide-react";
import { prepararQr } from "./acciones";

export default function CobroQr({ listo, hayToken }: { listo: boolean; hayToken: boolean }) {
  const [estado, accion, cargando] = useActionState(prepararQr, {});
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="flex items-center gap-2 font-semibold"><QrCode size={17} strokeWidth={1.8} /> Cobro con QR</p>
      {listo ? <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={16} /> Preparado: en la caja aparece «Cobrar con QR» al elegir un medio de Mercado Pago o billetera.</p> : (
        <form action={accion} className="space-y-3">
          <p className="text-sm text-texto-2">La caja muestra un QR con el monto de la venta y el cliente paga escaneándolo. Mercado Pago pide la dirección del local una sola vez para crear la sucursal y la caja.</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="calle">Calle</label><input id="calle" name="calle" className="campo" autoComplete="off" /></div>
            <div><label className="etiqueta" htmlFor="numero">Número</label><input id="numero" name="numero" className="campo" inputMode="numeric" autoComplete="off" /></div>
            <div><label className="etiqueta" htmlFor="ciudad">Ciudad</label><input id="ciudad" name="ciudad" className="campo" autoComplete="off" /></div>
            <div className="sm:col-span-2"><label className="etiqueta" htmlFor="provincia">Provincia</label><input id="provincia" name="provincia" className="campo" autoComplete="off" /></div>
          </div>
          {estado.error && <p className="text-sm text-error" role="alert">{estado.error}</p>}
          {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
          <button className="boton" disabled={cargando || !hayToken}>{cargando ? "Preparando…" : "Preparar cobro con QR"}</button>
          {!hayToken && <p className="text-xs text-texto-2">Primero cargá el Access Token arriba.</p>}
        </form>
      )}
    </div>
  );
}
