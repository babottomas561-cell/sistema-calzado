"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { ingresar, reenviarConfirmacion } from "./acciones";

const AVISOS: Record<string, string> = {
  enlace: "El link del mail venció o ya se usó. Ingresá, o pedí uno nuevo.",
};

// Si ingresó con un email sin confirmar: botón para reenviar el mail
function SinConfirmar({ email }: { email: string }) {
  const [estado, accion, cargando] = useActionState(reenviarConfirmacion, {});
  return (
    <form action={accion} className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm">
      <input type="hidden" name="email" value={email} />
      <p className="text-alerta">Todavía no confirmaste tu email. Buscá el mail que te mandamos (fijate en spam) o pedí otro.</p>
      <button className="boton-sec w-full" disabled={cargando}>{cargando ? "Enviando…" : "Reenviarme el mail de confirmación"}</button>
      {estado.ok && <p className="flex items-center gap-1.5 text-ok"><CircleCheck size={15} /> {estado.ok}</p>}
      {estado.error && <p className="text-error">{estado.error}</p>}
    </form>
  );
}

function Formulario() {
  const params = useSearchParams();
  const volver = params.get("volver") ?? "";
  const aviso = AVISOS[params.get("aviso") ?? ""];
  const [estado, accion, cargando] = useActionState(ingresar, {});
  const sinConfirmar = estado.valores?.sinConfirmar === "1";
  return (
    <form action={accion} className="tarjeta mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-xl font-bold">Ingresar</h1>
      {aviso && <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-alerta"><CircleAlert size={16} className="mt-0.5 shrink-0" /> {aviso}</p>}
      <input type="hidden" name="volver" value={volver} />
      <div><label className="etiqueta" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="email" key={estado.valores?.intento} defaultValue={estado.valores?.email} className="campo" /></div>
      <div><label className="etiqueta" htmlFor="clave">Contraseña</label><input id="clave" name="clave" type="password" required autoComplete="current-password" className="campo" /></div>
      {estado.error && !sinConfirmar && <p className="text-sm text-error" role="alert">{estado.error}</p>}
      <button className="boton w-full" disabled={cargando}>{cargando ? "Ingresando…" : "Ingresar"}</button>
      {sinConfirmar && estado.valores?.email && <SinConfirmar email={estado.valores.email} />}
      <p className="text-center text-sm"><Link href="/olvide-clave" className="text-texto-2 hover:text-marca">Olvidé mi contraseña</Link></p>
      <p className="text-center text-sm">¿No tenés cuenta? <Link href={`/registro${volver ? `?volver=${encodeURIComponent(volver)}` : ""}`} className="font-semibold text-marca">Registrate</Link></p>
    </form>
  );
}

export default function Ingresar() {
  return <Suspense><Formulario /></Suspense>;
}
