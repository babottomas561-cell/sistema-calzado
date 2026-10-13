"use client";
// Empezar la contabilidad: se elige la fecha y la base arma sola el asiento de apertura (stock a costo, saldos a favor, crédito con proveedores).
import { useActionState } from "react";
import { CircleAlert, CircleCheck, PlayCircle } from "lucide-react";
import { iniciarContabilidad, type Estado } from "./acciones";

export default function Iniciar({ hoy }: { hoy: string }) {
  const [estado, accion, iniciando] = useActionState<Estado, FormData>(iniciarContabilidad, {});
  return (
    <form action={accion} className="tarjeta space-y-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-marca-suave text-marca"><PlayCircle size={22} strokeWidth={1.8} /></span>
        <div>
          <h2 className="font-semibold">La contabilidad todavía no empezó</h2>
          <p className="text-sm text-texto-2">Elegí desde qué fecha. El sistema arma solo el <b>asiento de apertura</b> con el stock valorizado a costo, los saldos a favor de clientes y el crédito con proveedores;
            lo demás (caja, bancos, deudas) lo completa tu contador con un asiento manual. Lo anterior a esa fecha no se asienta.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="etiqueta" htmlFor="fecha-inicio">Fecha de inicio</label><input id="fecha-inicio" name="fecha" type="date" defaultValue={hoy} max={hoy} required className="campo h-11" /></div>
        <button className="boton min-h-11" disabled={iniciando}>{iniciando ? "Iniciando…" : "Iniciar la contabilidad"}</button>
      </div>
      {estado.ok && <p role="status" className="flex items-center gap-1.5 text-sm font-semibold text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      {estado.error && <p role="alert" className="flex items-center gap-1.5 text-sm text-error"><CircleAlert size={16} /> {estado.error}</p>}
    </form>
  );
}
