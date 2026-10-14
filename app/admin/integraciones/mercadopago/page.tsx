// Mercado Pago: las claves, de quién es la cuenta conectada, los avisos de pago y cómo cobra la tienda.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import MercadoPago, { type EstadoMP } from "../MercadoPago";
import AvisoWebhook from "../AvisoWebhook";
import CobroQr from "../CobroQr";
import MercadoPagoPoint, { type EstadoPoint } from "../MercadoPagoPoint";
import { sitio } from "../sitio";

export default async function PaginaMercadoPago() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: mp }, { data: point }, { data: qr }, { data: webhook }, { data: fijo }, { data: config }] = await Promise.all([
    supabase.rpc("estado_mercadopago"),
    supabase.rpc("estado_point"),
    supabase.rpc("estado_qr"),
    supabase.rpc("estado_webhook_mp"),
    supabase.rpc("qr_fijo"),
    supabase.from("configuracion_tienda").select("mp_modo, mp_cuotas_max").single(),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Mercado Pago"
        texto="Cobrar online los pedidos de la tienda: tarjeta, débito, cuotas o dinero en cuenta. Usá una cuenta de Mercado Pago a nombre del local, no una personal." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {webhook && <AvisoWebhook actual={(webhook as { actual: string }).actual} cargada={(webhook as { cargada: string | null }).cargada} desactualizada={(webhook as { desactualizada: boolean }).desactualizada} />}
        {mp && config && <MercadoPago estado={mp as unknown as EstadoMP} modo={config.mp_modo} cuotasMax={config.mp_cuotas_max} webhook={`${sitio()}/api/mercadopago`} />}
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <CobroQr listo={!!(qr as { listo?: boolean } | null)?.listo} hayToken={!!(mp as { token?: string | null } | null)?.token} fijo={fijo as { imagen?: string | null; plantilla?: string | null } | null} />
      </section>
      {/* Solo para quien tiene el posnet de Mercado Pago: plegado hasta que se use */}
      <details className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm" open={!!(point as { terminales?: unknown[] } | null)?.terminales?.length}>
        <summary className="cursor-pointer px-5 py-3 font-semibold">Tengo un posnet de Mercado Pago (Point)</summary>
        <p className="px-5 text-sm text-texto-2">Cobrar con tarjeta en el local con el posnet: la caja le manda el monto y espera la respuesta. Si no tenés uno, no hace falta tocar nada.</p>
        {point && <MercadoPagoPoint estado={point as unknown as EstadoPoint} />}
      </details>
      <Manual nombre="mercadopago" abierto={!(mp as { token?: string | null } | null)?.token} />
    </div>
  );
}
