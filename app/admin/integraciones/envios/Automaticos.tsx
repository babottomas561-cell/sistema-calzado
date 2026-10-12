"use client";
// Uber Direct y Andreani: cargar sus credenciales (se guardan en la base y no se vuelven a leer) y probar la conexión.
// Con las credenciales probadas, pedir el envío solo se suma más adelante sin tocar esta pantalla.
import { useActionState } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { guardarCredencialesEnvio, probarServicioEnvio } from "../acciones";

type Prueba = { ok: boolean; fecha: string; error?: string } | null;
export type EstadoEnvios = {
  uber: { customer_id: string | null; client_id: string | null; secreto: string | null; completo: boolean; prueba: Prueba };
  andreani: { usuario: string | null; cliente: string | null; contrato: string | null; clave: string | null; completo: boolean; prueba: Prueba };
};

function Campo({ nombre, etiqueta, valor, secreto = false, ayuda }: { nombre: string; etiqueta: string; valor: string | null; secreto?: boolean; ayuda?: string }) {
  return (
    <div>
      <label className="etiqueta flex items-center justify-between gap-2" htmlFor={nombre}>{etiqueta}
        {valor ? <span className="inline-flex items-center gap-1 text-xs font-normal text-ok"><CircleCheck size={13} /> {secreto ? `Cargada ${valor}` : valor}</span>
          : <span className="text-xs font-normal text-texto-2">Sin cargar</span>}</label>
      <input id={nombre} name={nombre} type={secreto ? "password" : "text"} autoComplete="off" placeholder={valor ? "Dejalo vacío para no cambiarlo" : ""} className="campo" />
      {ayuda && <p className="mt-0.5 text-[11px] text-texto-2">{ayuda}</p>}
    </div>
  );
}

function Estado({ completo, prueba }: { completo: boolean; prueba: Prueba }) {
  if (!completo) return <p className="flex items-center gap-1.5 rounded-lg bg-gray-50 p-2.5 text-sm text-texto-2"><CircleAlert size={16} /> Sin credenciales: falta pedir el acceso</p>;
  if (prueba?.ok) return <p className="flex items-center gap-1.5 rounded-lg bg-green-50 p-2.5 text-sm text-ok"><CircleCheck size={16} /> Conectado (probado {fechaHora(prueba.fecha)})</p>;
  if (prueba) return <p className="flex items-center gap-1.5 rounded-lg bg-red-50 p-2.5 text-sm text-error"><CircleAlert size={16} /> No conecta: {prueba.error}</p>;
  return <p className="flex items-center gap-1.5 rounded-lg bg-amber-50 p-2.5 text-sm text-alerta"><CircleAlert size={16} /> Cargadas, falta probarlas</p>;
}

function Servicio({ servicio, titulo, para, completo, prueba, children }: { servicio: "uber" | "andreani"; titulo: string; para: string; completo: boolean; prueba: Prueba; children: React.ReactNode }) {
  const [guardado, guardar, guardando] = useActionState(guardarCredencialesEnvio, {});
  const [probado, probar, probando] = useActionState(probarServicioEnvio, {});
  return (
    <div className="space-y-3 rounded-lg border border-borde p-3">
      <div><p className="font-semibold">{titulo}</p><p className="text-xs text-texto-2">{para}</p></div>
      <Estado completo={completo} prueba={prueba} />
      <form action={guardar} className="space-y-2">
        {children}
        {completo && <label className="inline-flex items-center gap-1.5 text-xs text-texto-2"><input type="checkbox" name="quitar" value={servicio} /> Quitar estas credenciales</label>}
        {guardado.error && <p className="text-sm text-error">{guardado.error}</p>}
        {guardado.ok && <p className="text-sm text-ok">{guardado.ok}</p>}
        <button className="boton-sec" disabled={guardando}>{guardando ? "Guardando…" : "Guardar"}</button>
      </form>
      <form action={probar} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="servicio" value={servicio} />
        <button className="boton-sec" disabled={probando || !completo}>{probando ? "Probando…" : "Probar conexión"}</button>
        {probado.error && <span className="text-sm text-error">{probado.error}</span>}
        {probado.ok && <span className="text-sm text-ok">{probado.ok}</span>}
      </form>
    </div>
  );
}

export default function Automaticos({ estado }: { estado: EstadoEnvios }) {
  const u = estado.uber, a = estado.andreani;
  return (
    <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-2">
      <Servicio servicio="uber" titulo="Uber Direct" completo={u.completo} prueba={u.prueba}
        para="Pedir el Uber solo cuando el pedido está listo. Se sacan de direct.uber.com (cuenta de empresa) → Developer.">
        <Campo nombre="uber_customer_id" etiqueta="Customer ID" valor={u.customer_id} />
        <Campo nombre="uber_client_id" etiqueta="Client ID" valor={u.client_id} />
        <Campo nombre="uber_client_secret" etiqueta="Client Secret" valor={u.secreto} secreto />
      </Servicio>
      <Servicio servicio="andreani" titulo="Andreani" completo={a.completo} prueba={a.prueba}
        para="Cotizar y despachar al interior. Las da tu ejecutivo de cuenta de Andreani al habilitar la API.">
        <Campo nombre="andreani_usuario" etiqueta="Usuario de la API" valor={a.usuario} />
        <Campo nombre="andreani_clave" etiqueta="Contraseña de la API" valor={a.clave} secreto />
        <div className="grid grid-cols-2 gap-2">
          <Campo nombre="andreani_cliente" etiqueta="Código de cliente" valor={a.cliente} />
          <Campo nombre="andreani_contrato" etiqueta="N.º de contrato" valor={a.contrato} ayuda="El de envíos a domicilio." />
        </div>
      </Servicio>
    </div>
  );
}
