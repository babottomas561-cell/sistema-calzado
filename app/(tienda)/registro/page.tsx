"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { registrarse } from "../ingresar/acciones";

function Formulario() {
  const volver = useSearchParams().get("volver") ?? "";
  const [estado, accion, cargando] = useActionState(registrarse, { error: "" });
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <div><h1 className="text-xl font-bold">Crear cuenta</h1><p className="text-sm text-texto-2">Para hacer pedidos y seguirlos.</p></div>
      <input type="hidden" name="volver" value={volver} />
      <div><label className="etiqueta">Nombre y apellido</label><input name="nombre" required autoComplete="name" className="campo" /></div>
      <div><label className="etiqueta">Email</label><input name="email" type="email" required autoComplete="email" className="campo" /></div>
      <div><label className="etiqueta">Teléfono (WhatsApp)</label><input name="telefono" type="tel" autoComplete="tel" className="campo" /></div>
      <div><label className="etiqueta">Contraseña</label><input name="clave" type="password" required minLength={8} autoComplete="new-password" className="campo" /></div>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Creando…" : "Crear cuenta"}</button>
      <p className="text-center text-sm">¿Ya tenés cuenta? <Link href={`/ingresar${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`} className="font-semibold text-marca">Ingresá</Link></p>
    </form>
  );
}

export default function Registro() {
  return <Suspense><Formulario /></Suspense>;
}
