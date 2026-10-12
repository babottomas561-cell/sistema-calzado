// Integraciones: la portada. Una tarjeta por servicio externo con su estado y el botón para configurarlo; cada uno
// tiene su pantalla (whatsapp/, ia/, mercadopago/, envios/) con su manual paso a paso adentro (docs/integraciones/).
// Lo ve quien tiene el permiso «Tienda online».
import Link from "next/link";
import { ChevronRight, CreditCard, MessageCircle, Sparkles, Truck, type LucideIcon } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";

type Estado = { texto: string; tono: "ok" | "falta" | "apagado" };
const TONO = { ok: "bg-green-50 text-ok", falta: "bg-amber-50 text-alerta", apagado: "bg-gray-100 text-texto-2" };

function Tarjeta({ href, icono: Icono, titulo, para, estados }: { href: string; icono: LucideIcon; titulo: string; para: string; estados: Estado[] }) {
  return (
    <Link href={href} className="tarjeta group flex flex-col gap-3 transition hover:border-marca">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 text-lg font-bold"><Icono size={20} strokeWidth={1.8} className="text-marca" /> {titulo}</span>
        <ChevronRight size={18} className="mt-1 shrink-0 text-texto-2 transition group-hover:translate-x-0.5 group-hover:text-marca" />
      </div>
      <p className="text-sm text-texto-2">{para}</p>
      <div className="mt-auto flex flex-wrap gap-1.5">{estados.map((e) => (
        <span key={e.texto} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TONO[e.tono]}`}>{e.texto}</span>
      ))}</div>
      <span className="text-sm font-semibold text-marca">Configurar</span>
    </Link>
  );
}

export default async function Integraciones() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: e }, { data: mp }, { data: t }, { count: zonas }] = await Promise.all([
    supabase.rpc("estado_integraciones"),
    supabase.rpc("estado_mercadopago"),
    supabase.from("configuracion_tienda").select("wa_bot_activo, wa_notificaciones_pedidos, mp_modo, ia_plan").single(),
    supabase.from("zonas_envio").select("id", { count: "exact", head: true }).eq("activo", true),
  ]);
  const wa = e as { meta_lista?: boolean; gemini?: string | null; ia_prueba?: { estado: string } | null } | null;
  const cuenta = (mp as { cuenta?: { ok: boolean; prueba?: boolean } | null } | null)?.cuenta;
  const MODO = { no: "No cobra online", opcional: "Cobro online opcional", obligatorio: "Solo pago online" } as const;

  return (
    <div className="max-w-5xl space-y-5">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Integraciones</h1>
        <p className="text-sm text-texto-2">Los servicios de afuera que usa el sistema. Entrá a cada uno para configurarlo: cada pantalla tiene su manual paso a paso.
          Las claves quedan guardadas en la base y nadie las puede volver a leer.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Tarjeta href="/admin/integraciones/whatsapp" icono={MessageCircle} titulo="WhatsApp"
          para="Contestar a los clientes con el número del local (bot) y avisarles solos cómo va su pedido."
          estados={[
            wa?.meta_lista ? { texto: "Conectado", tono: "ok" } : { texto: "Falta conectar", tono: "falta" },
            { texto: t?.wa_bot_activo ? "Bot prendido" : "Bot apagado", tono: t?.wa_bot_activo ? "ok" : "apagado" },
            { texto: t?.wa_notificaciones_pedidos ? "Avisos prendidos" : "Avisos apagados", tono: t?.wa_notificaciones_pedidos ? "ok" : "apagado" },
          ]} />
        <Tarjeta href="/admin/integraciones/ia" icono={Sparkles} titulo="Inteligencia artificial"
          para="Gemini, de Google: le da al bot la capacidad de contestar con el stock, los precios y el estado de los pedidos. Opcional."
          estados={[
            !wa?.gemini ? { texto: "Sin clave", tono: "apagado" } : wa.ia_prueba?.estado === "error" ? { texto: "La clave no anda", tono: "falta" } : { texto: "Clave cargada", tono: "ok" },
            { texto: t?.ia_plan === "pago" ? "Plan pago" : "Plan gratis", tono: "apagado" },
          ]} />
        <Tarjeta href="/admin/integraciones/mercadopago" icono={CreditCard} titulo="Mercado Pago"
          para="Cobrar online los pedidos de la tienda: tarjeta, débito, cuotas o dinero en cuenta. La comisión va sola a Gastos."
          estados={[
            !cuenta ? { texto: "Falta conectar", tono: "falta" } : !cuenta.ok ? { texto: "No conecta", tono: "falta" } : cuenta.prueba ? { texto: "Cuenta de prueba", tono: "falta" } : { texto: "Conectado", tono: "ok" },
            { texto: MODO[(t?.mp_modo ?? "no") as keyof typeof MODO], tono: t?.mp_modo && t.mp_modo !== "no" ? "ok" : "apagado" },
          ]} />
        <Tarjeta href="/admin/integraciones/envios" icono={Truck} titulo="Envíos"
          para="Zonas de Tucumán con su precio, el Uber de cada pedido y lo que costó (va a Gastos). Uber Direct y Andreani, cuando haya acceso."
          estados={[zonas ? { texto: `${zonas} ${zonas === 1 ? "zona" : "zonas"}`, tono: "ok" } : { texto: "Sin zonas (se coordina)", tono: "falta" }]} />
      </div>
    </div>
  );
}
