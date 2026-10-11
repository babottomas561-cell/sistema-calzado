"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { CircleCheck } from "lucide-react";
import { registrarse } from "../ingresar/acciones";

function Formulario() {
  const volver = useSearchParams().get("volver") ?? "";
  const [estado, accion, cargando] = useActionState(registrarse, {});
  // React vacía el formulario después de enviarlo: con la key, cada campo se vuelve a crear con lo
  // que había escrito (defaultValue solo no alcanza, el reset llega después)
  const v = estado.valores ?? {};
  if (estado.ok) return (
    <div className="tarjeta mx-auto max-w-sm space-y-3 p-6 text-center">
      <CircleCheck size={40} className="mx-auto text-ok" />
      <h1 className="text-xl font-bold">Revisá tu email</h1>
      <p className="text-sm text-texto-2">{estado.ok}</p>
      <Link href="/ingresar" className="boton w-full">Ir a ingresar</Link>
    </div>
  );
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <div><h1 className="text-xl font-bold">Crear cuenta</h1><p className="text-sm text-texto-2">Para hacer pedidos y seguirlos.</p></div>
      <input type="hidden" name="volver" value={volver} />
      <div><label className="etiqueta">Nombre y apellido</label><input name="nombre" required autoComplete="name" key={`nombre-${v.intento}`} defaultValue={v.nombre} className="campo" /></div>
      <div><label className="etiqueta">Email</label><input name="email" type="email" required autoComplete="email" key={`email-${v.intento}`} defaultValue={v.email} className="campo" /></div>
      <div><label className="etiqueta">Teléfono (WhatsApp)</label><input name="telefono" type="tel" autoComplete="tel" key={`telefono-${v.intento}`} defaultValue={v.telefono} className="campo" /></div>
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
