// Envíos: las zonas de Tucumán con su precio (lo que paga el cliente) y el estado de Uber Direct y Andreani.
// El costo real de cada envío se anota en el pedido y va a Gastos → Envíos.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import ZonasEnvio from "./ZonasEnvio";

export default async function Envios() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const { data: zonas } = await supabase.from("zonas_envio").select("id, nombre, descripcion, precio, activo").order("activo", { ascending: false }).order("orden").order("nombre");
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Envíos" guia="#parte-13"
        texto="Los envíos en Tucumán se mandan por Uber: cargá las zonas con lo que paga el cliente, y en cada pedido pedí el Uber y anotá lo que costó (va a Gastos)." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">1. Zonas de envío</h2>
          <p className="text-sm text-texto-2">Lo que paga el cliente según dónde vive. La tienda las ofrece al elegir «Envío a domicilio». Sin precio = «a coordinar».</p></div>
        <ZonasEnvio zonas={(zonas ?? []).map((z) => ({ ...z, precio: z.precio == null ? null : Number(z.precio) }))} />
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">2. Cómo se manda cada envío</h2></div>
        <div className="space-y-2 px-5 py-4 text-sm">
          <p>En el pedido (Pedidos → el pedido) está la tarjeta <b>Envío</b>: <b>Copiar datos para Uber</b> deja listos el nombre, el teléfono y la dirección, y <b>Abrir Uber</b> abre la app. En Uber elegí <b>Envíos</b>, pegá los datos y, cuando lo pidas, anotá en el pedido lo que cobró y el link de seguimiento (el cliente lo ve en su pedido).</p>
          <p className="text-texto-2">Lo que costó cada envío va solo a Gastos → Envíos, y el Resultado del mes muestra lo cobrado por envíos contra lo que costaron.</p>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        <div className="border-b border-borde px-5 py-4"><h2 className="font-semibold">Envíos automáticos (próximamente)</h2></div>
        <ul className="space-y-2 px-5 py-4 text-sm">
          <li><b>Uber Direct</b> — pedir el Uber solo cuando el pedido está listo, con el seguimiento por WhatsApp. Necesita una cuenta de empresa en direct.uber.com y que Uber la habilite en Argentina. <span className="text-texto-2">Estado: falta pedir el acceso.</span></li>
          <li><b>Andreani</b> — cotizar y despachar al interior. Necesita cuenta comercial de Andreani (suelen pedir un mínimo de envíos por mes). <span className="text-texto-2">Estado: falta pedir el acceso.</span></li>
        </ul>
      </section>
    </div>
  );
}
