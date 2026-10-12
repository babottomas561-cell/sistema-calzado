// WhatsApp (Meta): la conexión (claves, webhook, prueba) y qué hace el sistema con ella (bot y avisos de pedidos).
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Conexiones, { type EstadoConexiones } from "../Conexiones";
import BotYAvisos, { type ConfigBot } from "../BotYAvisos";
import { sitio } from "../sitio";

export default async function WhatsApp() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: estado }, { data: envios }, { data: config }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.rpc("wa_envios_recientes", { p_limite: 10 }),
    supabase.from("configuracion_tienda").select("wa_bot_activo, wa_notificaciones_pedidos, wa_plantilla_estado, wa_idioma_plantilla").single(),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="WhatsApp" guia="#parte-1"
        texto="Recibir y contestar los mensajes de los clientes con el número del local, y avisarles solos cómo va su pedido. Se conecta con la API oficial de Meta." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Conexión con Meta</h2>
          <p className="text-sm text-texto-2">Las claves quedan guardadas en la base y nadie las puede volver a leer: acá solo se ve si están cargadas.</p></div>
        {estado && <Conexiones estado={estado as EstadoConexiones} webhook={`${sitio()}/api/whatsapp`} envios={envios ?? []} />}
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Bot y avisos de pedidos</h2>
          <p className="text-sm text-texto-2">Qué hace el sistema con la conexión. El bot usa la IA si está configurada (Integraciones → Inteligencia artificial).</p></div>
        {config && <BotYAvisos config={config as ConfigBot} />}
      </section>
    </div>
  );
}
