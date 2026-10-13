"use client";
import { useActionState } from "react";
import { CircleCheck, Save } from "lucide-react";
import { guardarPin } from "./acciones";

export default function FormPin({ tienePin }: { tienePin: boolean }) {
  const [estado, accion, cargando] = useActionState(guardarPin, {});
  return (
    <form action={accion} className="tarjeta max-w-md space-y-4">
      <div>
        <h2 className="font-semibold">Mi PIN de autorización</h2>
        <p className="mt-1 text-sm text-texto-2">Con este PIN autorizás en la caja un descuento por encima del tope de quien vende. {tienePin ? "Ya tenés uno: si lo cambiás, el anterior deja de servir." : "Todavía no tenés uno."} Son de 4 a 8 números y nadie puede verlo (ni el Administrador).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="etiqueta" htmlFor="pin">Nuevo PIN</label><input id="pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" maxLength={8} required className="campo tabular-nums tracking-widest" /></div>
        <div><label className="etiqueta" htmlFor="repetido">Repetilo</label><input id="repetido" name="repetido" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4,8}" maxLength={8} required className="campo tabular-nums tracking-widest" /></div>
      </div>
      {estado.error && <p role="alert" className="text-sm font-medium text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className="boton" disabled={cargando}><Save size={16} /> {cargando ? "Guardando…" : "Guardar PIN"}</button>
    </form>
  );
}
