// Mercado Pago: las claves, de quién es la cuenta conectada, los avisos de pago y cómo cobra la tienda.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import MercadoPago, { type EstadoMP } from "../MercadoPago";
import { sitio } from "../sitio";

export default async function PaginaMercadoPago() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: mp }, { data: config }] = await Promise.all([
    supabase.rpc("estado_mercadopago"),
    supabase.from("configuracion_tienda").select("mp_modo, mp_cuotas_max").single(),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Mercado Pago"
        texto="Cobrar online los pedidos de la tienda: tarjeta, débito, cuotas o dinero en cuenta. Usá una cuenta de Mercado Pago a nombre del local, no una personal." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {mp && config && <MercadoPago estado={mp as unknown as EstadoMP} modo={config.mp_modo} cuotasMax={config.mp_cuotas_max} webhook={`${sitio()}/api/mercadopago`} />}
      </section>
      <Manual nombre="mercadopago" abierto={!(mp as { token?: string | null } | null)?.token} />
    </div>
  );
}
