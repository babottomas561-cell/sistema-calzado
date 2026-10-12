// Inteligencia artificial (Gemini): la clave, el modelo, el precio y el plan, la prueba y cuánto se usa.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { diaArgentina } from "@/lib/formato";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import IA, { type ConfigIA, type EstadoIA, type Modelo } from "../IA";

export default async function InteligenciaArtificial() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  // Si Google ya contestó la lista de modelos (revisión diaria o «Buscar ahora»), se procesa al abrir
  await supabase.rpc("ia_revisar_modelos", { p_pedir: false });
  const [{ data: estado }, { data: config }, { data: modelos }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.from("configuracion_tienda").select("ia_modelo, ia_plan").single(),
    supabase.from("ia_modelos").select("id, nombre, precio_entrada, precio_salida, tiene_gratis, limite_diario_gratis, nota, verificado, disponible, nuevo")
      .order("disponible", { ascending: false }).order("orden").order("id"),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Inteligencia artificial"
        texto="Gemini, de Google, le da al bot de WhatsApp la capacidad de contestar con el stock, los precios y el estado de los pedidos. Es opcional: sin la clave, el bot contesta un mensaje fijo." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {estado && config && <IA config={config as ConfigIA} ia={estado as unknown as EstadoIA} hoy={diaArgentina()}
          modelos={(modelos ?? []).map((m) => ({ ...m, precio_entrada: m.precio_entrada == null ? null : Number(m.precio_entrada), precio_salida: m.precio_salida == null ? null : Number(m.precio_salida) })) as Modelo[]} />}
      </section>
      <Manual nombre="ia" abierto={!(estado as { gemini?: string | null } | null)?.gemini} />
    </div>
  );
}
