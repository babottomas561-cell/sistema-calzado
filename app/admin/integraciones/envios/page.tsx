// Envíos: las zonas de Tucumán con su precio (lo que paga el cliente) y el estado de Uber Direct y Andreani.
// El costo real de cada envío se anota en el pedido y va a Gastos → Envíos.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import ZonasEnvio from "./ZonasEnvio";
import ReglaPago from "./ReglaPago";
import Automaticos, { type EstadoEnvios } from "./Automaticos";

export default async function Envios() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: zonas }, { data: config }, { data: credenciales }] = await Promise.all([
    supabase.from("zonas_envio").select("id, nombre, descripcion, precio, activo").order("activo", { ascending: false }).order("orden").order("nombre"),
    supabase.from("configuracion_tienda").select("envio_requiere_pago").single(),
    supabase.rpc("estado_envios"),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Envíos"
        texto="Los envíos en Tucumán se mandan por Uber: cargá las zonas con lo que paga el cliente, y en cada pedido pedí el Uber y anotá lo que costó (va a Gastos)." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">1. Zonas de envío</h2>
          <p className="text-sm text-texto-2">Lo que paga el cliente según dónde vive. La tienda las ofrece al elegir «Envío a domicilio». Sin precio = «a coordinar».</p></div>
        <ZonasEnvio zonas={(zonas ?? []).map((z) => ({ ...z, precio: z.precio == null ? null : Number(z.precio) }))} />
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">2. Cobrar antes de enviar</h2></div>
        <ReglaPago activa={config?.envio_requiere_pago ?? true} />
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">3. Cómo se manda cada envío</h2></div>
        <div className="space-y-2 px-5 py-4 text-sm">
          <p>Primero, que esté <b>pagado</b>: si pagó con Mercado Pago ya figura; si transfirió, en el pedido tocá <b>Registrar pago recibido</b>.</p>
          <p>En el pedido (Pedidos → el pedido) está la tarjeta <b>Envío</b>: <b>Copiar datos para Uber</b> deja listos el nombre, el teléfono y la dirección, y <b>Abrir Uber</b> abre la app. En Uber elegí <b>Envíos</b>, pegá los datos y, cuando lo pidas, anotá en el pedido lo que cobró y el link de seguimiento (el cliente lo ve en su pedido).</p>
          <p className="text-texto-2">Lo que costó cada envío va solo a Gastos → Envíos, y el Resultado del mes muestra lo cobrado por envíos contra lo que costaron.</p>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">4. Envíos automáticos: Uber Direct y Andreani</h2>
          <p className="text-sm text-texto-2">Cuando el local consiga el acceso, cargá acá las credenciales y probalas. Mientras tanto, los envíos se piden a mano como en el paso 3.</p></div>
        {credenciales && <Automaticos estado={credenciales as unknown as EstadoEnvios} />}
      </section>
      <Manual nombre="envios" abierto={!(zonas ?? []).length} />
    </div>
  );
}
