"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { CircleAlert, MailCheck } from "lucide-react";
import { pedirRecuperacion } from "../ingresar/acciones";

function Formulario() {
  const vencido = useSearchParams().get("aviso") === "enlace";
  const [estado, accion, cargando] = useActionState(pedirRecuperacion, {});
  if (estado.ok) return (
    <div className="tarjeta mx-auto max-w-sm space-y-3 p-6 text-center">
      <MailCheck size={40} className="mx-auto text-marca" />
      <h1 className="text-xl font-bold">Revisá tu email</h1>
      <p className="text-sm text-texto-2">{estado.ok}</p>
      <Link href="/ingresar" className="boton w-full">Volver a ingresar</Link>
    </div>
  );
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <div><h1 className="text-xl font-bold">Olvidé mi contraseña</h1><p className="text-sm text-texto-2">Escribí tu email y te mandamos un link para elegir una nueva.</p></div>
      {vencido && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} className="mt-0.5 shrink-0" /> El link venció o ya se usó. Pedí uno nuevo.</p>}
      <div><label className="etiqueta" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" defaultValue={estado.valores?.email} className="campo" /></div>
      {estado.error && <p className="text-sm text-error" role="alert">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Enviando…" : "Mandarme el link"}</button>
      <p className="text-center text-sm"><Link href="/ingresar" className="font-semibold text-marca">Volver a ingresar</Link></p>
    </form>
  );
}

export default function OlvideClave() {
  return <Suspense><Formulario /></Suspense>;
}
