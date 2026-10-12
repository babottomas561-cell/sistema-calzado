// Integraciones: WhatsApp (Meta) y la IA (Gemini). Las claves se cargan acá y quedan en la base sin que nadie las
// pueda volver a leer (ver docs/WHATSAPP.md). Lo ve quien tiene el permiso «Tienda online».
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Conexiones, { type EstadoConexiones } from "./Conexiones";

export default async function Integraciones() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: estado }, { data: envios }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.rpc("wa_envios_recientes", { p_limite: 10 }),
  ]);
  // La dirección que se pega en Meta (la de producción; en local, la de esta compu)
  const webhook = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}/api/whatsapp` : "http://localhost:3000/api/whatsapp";
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="text-sm text-texto-2">WhatsApp (Meta) y la IA (Gemini). Las claves quedan guardadas en la base y nadie las puede volver a leer: acá solo se ve si están cargadas.
          El bot y los avisos de pedidos se prenden en <Link href="/admin/tienda" className="text-marca">Tienda online</Link> → Datos de la tienda.</p></div>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {estado && <Conexiones estado={estado as EstadoConexiones} webhook={webhook} envios={envios ?? []} />}
      </section>
    </div>
  );
}
