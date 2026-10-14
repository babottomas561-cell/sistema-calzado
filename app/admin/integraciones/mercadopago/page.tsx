// Mercado Pago: las claves, de quién es la cuenta conectada, los avisos de pago y cómo cobra la tienda.
import { crearCliente } from "@/lib/supabase/server";
import Link from "next/link";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import MercadoPago, { type EstadoMP } from "../MercadoPago";
import AvisoWebhook from "../AvisoWebhook";
import PreferenciasCobro, { type DatosPreferencias } from "../PreferenciasCobro";
import CobroQr from "../CobroQr";
import MercadoPagoPoint, { type EstadoPoint } from "../MercadoPagoPoint";
import { sitio } from "../sitio";
import Requisitos from "@/components/Requisitos";

export default async function PaginaMercadoPago() {
  const { permisos } = await exigir("tienda.editar");
  const supabase = await crearCliente();
  const { data: apagadosDatos } = await supabase.from("modulos").select("clave").eq("activo", false).like("clave", "mercadopago/%");
  const posnetOn = !(apagadosDatos ?? []).some((m) => m.clave === "mercadopago/posnet");
  const qrOn = !(apagadosDatos ?? []).some((m) => m.clave === "mercadopago/qr");
  const [{ data: mp }, { data: point }, { data: qr }, { data: webhook }, { data: fijo }, { data: espera }, { data: config }] = await Promise.all([
    supabase.rpc("estado_mercadopago"),
    supabase.rpc("estado_point"),
    supabase.rpc("estado_qr"),
    supabase.rpc("estado_webhook_mp"),
    supabase.rpc("qr_fijo"),
    supabase.rpc("cobro_espera_pago"),
    supabase.from("configuracion_tienda").select("mp_modo, mp_cuotas_max, qr_monto_minimo").single(),
  ]);
  // Las preferencias de cobro las maneja quien administra el equipo
  let prefs: DatosPreferencias | null = null;
  if (puede(permisos, "equipo.administrar")) {
    const [{ data: roles }, { data: personas }, { data: dispositivos }, { data: cajas }, { data: preferencias }] = await Promise.all([
      supabase.from("roles").select("id, nombre").eq("activo", true).order("nombre"),
      supabase.from("perfiles").select("id, nombre").eq("rol", "staff").order("nombre"),
      supabase.from("dispositivos").select("id, clave, nombre, caja_id").eq("activo", true).order("nombre"),
      supabase.from("cajas").select("id, nombre, sucursales(nombre)").eq("activa", true).order("id"),
      supabase.from("preferencias_cobro").select("ambito, referencia, medio, habilitado"),
    ]);
    prefs = { roles: roles ?? [], personas: personas ?? [], dispositivos: dispositivos ?? [], cajas: (cajas ?? []).map((c) => ({ id: c.id, nombre: c.nombre, sucursal: (c.sucursales as { nombre?: string } | null)?.nombre ?? "" })), preferencias: preferencias ?? [] };
  }
  return (
    <div className="max-w-4xl space-y-6">
      <Requisitos accion="cobrar_online" />
      <Encabezado titulo="Mercado Pago"
        texto="Cobrar online los pedidos de la tienda: tarjeta, débito, cuotas o dinero en cuenta. Usá una cuenta de Mercado Pago a nombre del local, no una personal." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {webhook && <AvisoWebhook actual={(webhook as { actual: string }).actual} cargada={(webhook as { cargada: string | null }).cargada} desactualizada={(webhook as { desactualizada: boolean }).desactualizada} />}
        {mp && config && <MercadoPago estado={mp as unknown as EstadoMP} modo={config.mp_modo} cuotasMax={config.mp_cuotas_max} webhook={`${sitio()}/api/mercadopago`} />}
      </section>
      {!posnetOn && !qrOn && <p className="rounded-lg bg-gray-50 p-3 text-sm text-texto-2">El cobro con posnet y con QR en el local se habilita en <Link href="/admin/parametrizacion" className="font-semibold text-marca">Parametrización</Link>.</p>}
      {qrOn && <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <CobroQr listo={!!(qr as { listo?: boolean } | null)?.listo} hayToken={!!(mp as { token?: string | null } | null)?.token} fijo={fijo as { imagen?: string | null; plantilla?: string | null } | null} cajaExterna={(qr as { caja_externa?: string | null } | null)?.caja_externa ?? null} espera={espera !== false} minimo={Number(config?.qr_monto_minimo ?? 15)} />
      </section>}
      {prefs && (posnetOn || qrOn) && <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm"><PreferenciasCobro datos={prefs} /></section>}
      {posnetOn && <details className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm" open={!!(point as { terminales?: unknown[] } | null)?.terminales?.length}>
        <summary className="cursor-pointer px-5 py-3 font-semibold">Tengo un posnet de Mercado Pago (Point)</summary>
        <p className="px-5 text-sm text-texto-2">Cobrar con tarjeta en el local con el posnet: la caja le manda el monto y espera la respuesta. Si no tenés uno, no hace falta tocar nada.</p>
        {point && <MercadoPagoPoint estado={point as unknown as EstadoPoint} />}
      </details>}
      <Manual nombre="mercadopago" abierto={!(mp as { token?: string | null } | null)?.token} />
    </div>
  );
}
