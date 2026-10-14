"use client";
// Cobro con QR: se prepara una sola vez (Mercado Pago pide una sucursal y una caja con la dirección del local).
import { useActionState } from "react";
import { CircleCheck, QrCode } from "lucide-react";
import { prepararQr } from "./acciones";

export default function CobroQr({ listo, hayToken, fijo }: { listo: boolean; hayToken: boolean; fijo?: { imagen?: string | null; plantilla?: string | null } | null }) {
  const [estado, accion, cargando] = useActionState(prepararQr, {});
  return (
    <div className="space-y-3 px-5 py-4">
      <p className="flex items-center gap-2 font-semibold"><QrCode size={17} strokeWidth={1.8} /> Cobro con QR</p>
      {listo ? (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={16} /> Preparado: en la caja aparece «Cobrar con QR» al elegir un medio de Mercado Pago o billetera.</p>
          {(fijo?.imagen || fijo?.plantilla) && (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-borde p-3">
              {fijo.imagen && <img src={fijo.imagen} alt="QR fijo del mostrador" width={120} height={120} className="rounded bg-white" />}
              <div className="min-w-48 flex-1 space-y-1 text-sm">
                <p className="font-semibold">QR fijo del mostrador</p>
                <p className="text-texto-2">Imprimilo y pegalo en el mostrador una sola vez. En la caja, «Con el QR del mostrador» le carga el monto de cada venta y el cliente lo ve al escanearlo.</p>
                {fijo.plantilla && <a href={fijo.plantilla} target="_blank" rel="noreferrer" className="inline-block font-medium text-marca">Abrir para imprimir</a>}
              </div>
            </div>
          )}
        </div>
      ) : (
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
