// Integraciones: WhatsApp (Meta) y la IA (Gemini), todo junto. Las claves se cargan acá y quedan en la base sin que
// nadie las pueda volver a leer; abajo, el bot, los avisos de pedidos, el modelo de IA y su prueba (ver docs/INTEGRACIONES.md).
// Lo ve quien tiene el permiso «Tienda online».
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Conexiones, { type EstadoConexiones } from "./Conexiones";
import Automatizaciones, { type Config, type EstadoIA, type Modelo } from "./Automatizaciones";
import { diaArgentina } from "@/lib/formato";
import MercadoPago, { type EstadoMP } from "./MercadoPago";

export default async function Integraciones() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  // Si Google ya contestó la lista de modelos (revisión diaria o «Buscar ahora»), se procesa al abrir
  await supabase.rpc("ia_revisar_modelos", { p_pedir: false });
  const [{ data: estado }, { data: envios }, { data: config }, { data: modelos }, { data: mp }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.rpc("wa_envios_recientes", { p_limite: 10 }),
    supabase.from("configuracion_tienda").select("wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla, ia_modelo, ia_plan, mp_modo, mp_cuotas_max").single(),
    supabase.from("ia_modelos").select("id, nombre, precio_entrada, precio_salida, tiene_gratis, limite_diario_gratis, nota, verificado, disponible, nuevo").order("disponible", { ascending: false }).order("orden").order("id"),
    supabase.rpc("estado_mercadopago"),
  ]);
  // La dirección que se pega en Meta (la de producción; en local, la de esta compu)
  const sitio = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
  const webhook = `${sitio}/api/whatsapp`;
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="text-sm text-texto-2">WhatsApp (Meta), la IA (Gemini) y Mercado Pago. Las claves quedan guardadas en la base y nadie las puede volver a leer: acá solo se ve si están cargadas.</p>
        <Link href="/admin/integraciones/guia" className="boton-sec mt-3 inline-flex items-center gap-1.5"><BookOpen size={16} strokeWidth={1.8} /> Cómo se configura, paso a paso</Link></div>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Conexiones</h2>
          <p className="text-sm text-texto-2">Las claves de Meta y de Gemini, el webhook y la prueba de WhatsApp.</p></div>
        {estado && <Conexiones estado={estado as EstadoConexiones} webhook={webhook} envios={envios ?? []} />}
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Bot, avisos e IA</h2>
          <p className="text-sm text-texto-2">Qué hace el sistema con esas conexiones.</p></div>
        {config && estado && <Automatizaciones config={config as Config} ia={estado as unknown as EstadoIA} hoy={diaArgentina()}
          modelos={(modelos ?? []).map((m) => ({ ...m, precio_entrada: m.precio_entrada == null ? null : Number(m.precio_entrada), precio_salida: m.precio_salida == null ? null : Number(m.precio_salida) })) as Modelo[]} />}
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Mercado Pago</h2>
          <p className="text-sm text-texto-2">Cobrar los pedidos de la tienda online. Usá una cuenta de Mercado Pago a nombre del local.</p></div>
        {mp && config && <MercadoPago estado={mp as unknown as EstadoMP} modo={config.mp_modo} cuotasMax={config.mp_cuotas_max} webhook={`${sitio}/api/mercadopago`} />}
      </section>
    </div>
  );
}
