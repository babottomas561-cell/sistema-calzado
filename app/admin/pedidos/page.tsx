// Pedidos de la tienda y de otros canales, por estado.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, pesos } from "@/lib/formato";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";
import { ESTADOS } from "@/lib/estados-pedido";

const VISTAS = { activos: ["pendiente", "confirmado", "preparado", "enviado", "listo_retiro"], cerrados: ["entregado", "cancelado"] } as const;

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver = "activos" } = await searchParams;
  const vista = ver === "cerrados" ? "cerrados" : "activos";
  const supabase = await crearCliente();
  const { data: pedidos, error } = await supabase.from("pedidos")
    .select("id, comprobante, fecha, total, estado, canal, entrega, clientes(nombre), medios_pago(nombre)")
    .in("estado", [...VISTAS[vista]]).order("fecha", { ascending: vista === "activos" }).limit(300);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Pedidos</h1>
      <div className="flex gap-2">
        {(["activos", "cerrados"] as const).map((k) => (
          <Link key={k} href={`/admin/pedidos?ver=${k}`} className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${k === vista ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{k}</Link>
        ))}
      </div>
      {error && <p className="text-error">{error.message}</p>}
      <ListaMovil vacio={pedidos?.length === 0 && `No hay pedidos ${vista}.`}>
        {(pedidos ?? []).map((p) => (
          <FilaMovil key={p.id} href={`/admin/pedidos/${p.id}`}
            titulo={(p.clientes as unknown as { nombre: string }).nombre}
            detalle={<>{fechaHora(p.fecha)} · <span className="font-mono">{p.comprobante}</span></>}
            extra={<><span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span>
              <span className="chip bg-gray-100">{p.entrega === "envio" ? "Envío" : "Retira"}</span>
              <span className="chip bg-gray-100 text-texto-2">{(p.medios_pago as unknown as { nombre: string }).nombre}</span></>}
            valor={<span className="font-bold">{pesos(p.total)}</span>} />
        ))}
      </ListaMovil>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Entrega</th><th>Pago</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {(pedidos ?? []).map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/pedidos/${p.id}`} className="font-mono font-semibold text-marca">{p.comprobante}</Link></td>
                <td>{fechaHora(p.fecha)}</td>
                <td>{(p.clientes as unknown as { nombre: string }).nombre}<div className="text-xs text-texto-2">{p.canal}</div></td>
                <td><span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span></td>
                <td>{p.entrega === "envio" ? "Envío" : "Retira"}</td>
                <td>{(p.medios_pago as unknown as { nombre: string }).nombre}</td>
                <td className="text-right font-semibold">{pesos(p.total)}</td>
              </tr>
            ))}
            {pedidos?.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-texto-2">No hay pedidos {vista}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
