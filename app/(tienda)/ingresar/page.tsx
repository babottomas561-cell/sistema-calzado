"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { ingresar } from "./acciones";

function Formulario() {
  const volver = useSearchParams().get("volver") ?? "";
  const [estado, accion, cargando] = useActionState(ingresar, {});
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">Ingresar</h1>
      <input type="hidden" name="volver" value={volver} />
      <div><label className="etiqueta" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" key={estado.valores?.intento} defaultValue={estado.valores?.email} className="campo" /></div>
      <div><label className="etiqueta" htmlFor="clave">Contraseña</label><input id="clave" name="clave" type="password" required autoComplete="current-password" className="campo" /></div>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
      <p className="text-center text-sm">¿No tenés cuenta? <Link href={`/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`} className="font-semibold text-marca">Registrate</Link></p>
    </form>
  );
}

export default function Ingresar() {
  return <Suspense><Formulario /></Suspense>;
}
