// Integraciones: WhatsApp (Meta) y la IA (Gemini), todo junto. Las claves se cargan acá y quedan en la base sin que
// nadie las pueda volver a leer; abajo, el bot, los avisos de pedidos, el modelo de IA y su prueba (ver docs/WHATSAPP.md).
// Lo ve quien tiene el permiso «Tienda online».
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Conexiones, { type EstadoConexiones } from "./Conexiones";
import Automatizaciones, { type Config, type EstadoIA, type PreciosIA } from "./Automatizaciones";

export default async function Integraciones() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: estado }, { data: envios }, { data: config }, { data: precios }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.rpc("wa_envios_recientes", { p_limite: 10 }),
    supabase.from("configuracion_tienda").select("wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla, ia_modelo").single(),
    // Sin permiso de Gastos la base no devuelve la fila: los precios no se muestran
    supabase.from("configuracion_gastos").select("ia_precio_entrada, ia_precio_salida").maybeSingle(),
  ]);
  // La dirección que se pega en Meta (la de producción; en local, la de esta compu)
  const webhook = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/whatsapp` : "http://localhost:3000/api/whatsapp";
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="text-sm text-texto-2">WhatsApp (Meta) y la IA (Gemini). Las claves quedan guardadas en la base y nadie las puede volver a leer: acá solo se ve si están cargadas.</p>
        <Link href="/admin/integraciones/guia" className="boton-sec mt-3 inline-flex items-center gap-1.5"><BookOpen size={16} strokeWidth={1.8} /> Cómo se configura, paso a paso</Link></div>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Conexiones</h2>
          <p className="text-sm text-texto-2">Las claves de Meta y de Gemini, el webhook y la prueba de WhatsApp.</p></div>
        {estado && <Conexiones estado={estado as EstadoConexiones} webhook={webhook} envios={envios ?? []} />}
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Bot, avisos e IA</h2>
          <p className="text-sm text-texto-2">Qué hace el sistema con esas conexiones.</p></div>
        {config && estado && <Automatizaciones config={config as Config} ia={estado as unknown as EstadoIA}
          precios={precios ? { ia_precio_entrada: Number(precios.ia_precio_entrada), ia_precio_salida: Number(precios.ia_precio_salida) } as PreciosIA : null} />}
      </section>
    </div>
  );
}
