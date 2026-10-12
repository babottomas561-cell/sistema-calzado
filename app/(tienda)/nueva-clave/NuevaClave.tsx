"use client";
import { useActionState, type ReactNode } from "react";
import { cambiarClave } from "../ingresar/acciones";

export default function NuevaClave({ regla, minimo, volver }: { regla: string; minimo: number; volver: ReactNode }) {
  const [estado, accion, cargando] = useActionState(cambiarClave, {});
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <div><h1 className="text-xl font-bold">Elegí tu contraseña nueva</h1><p className="text-sm text-texto-2">{regla}</p></div>
      <div><label className="etiqueta" htmlFor="clave">Contraseña nueva</label><input id="clave" name="clave" type="password" required minLength={minimo} autoComplete="new-password" className="campo" /></div>
      <div><label className="etiqueta" htmlFor="repetir">Repetila</label><input id="repetir" name="repetir" type="password" required minLength={minimo} autoComplete="new-password" className="campo" /></div>
      {estado.error && <p className="text-sm text-error" role="alert">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Guardando…" : "Guardar contraseña"}</button>
      <p className="text-center text-sm">{volver}</p>
    </form>
  );
}
