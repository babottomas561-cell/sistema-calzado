// Listado de presupuestos: qué se ofreció, a quién, hasta cuándo vale y en qué quedó.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, pesos } from "@/lib/formato";
import { ESTADOS_PRESUPUESTO, estadoVisible, hasta } from "@/lib/presupuesto";
import { Plus } from "lucide-react";
import { exigir } from "@/lib/exigir";

export default async function Presupuestos() {
  await exigir("ventas.registrar", "ventas.ver_todas");
  const supabase = await crearCliente();
  const { data, error } = await supabase.from("presupuestos")
    .select("id, comprobante, fecha, valido_hasta, estado, total, canal, clientes(nombre), presupuesto_items(cantidad)")
    .order("fecha", { ascending: false }).limit(300);
  const lista = (data ?? []).map((p) => ({ ...p, visible: estadoVisible(p.estado, p.valido_hasta) }));
  const abiertos = lista.filter((p) => p.visible === "vigente");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Presupuestos</h1>
        <Link href="/admin/presupuestos/nuevo" className="boton"><Plus size={16} /> Nuevo presupuesto</Link>
      </div>
      <p className="text-sm text-texto-2">Un presupuesto no reserva stock: congela precios y promociones hasta su vencimiento. Al confirmarlo se convierte en venta.</p>
      {error && <p className="text-error">{error.message}</p>}
      {abiertos.length > 0 && <p className="text-sm"><b>{abiertos.length}</b> vigentes por <b>{pesos(abiertos.reduce((s, p) => s + Number(p.total), 0))}</b></p>}
      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th className="text-right">Unidades</th><th className="text-right">Total</th><th>Válido hasta</th><th>Estado</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/presupuestos/${p.id}`} className="font-mono font-semibold text-marca">{p.comprobante}</Link></td>
                <td>{fecha(p.fecha)}</td>
                <td>{(p.clientes as { nombre: string } | null)?.nombre ?? <span className="text-texto-2">Sin cliente</span>}</td>
                <td className="text-right">{(p.presupuesto_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0)}</td>
                <td className="text-right font-semibold">{pesos(p.total)}</td>
                <td>{hasta(p.valido_hasta)}</td>
                <td><span className={`chip ${ESTADOS_PRESUPUESTO[p.visible].color}`}>{ESTADOS_PRESUPUESTO[p.visible].texto}</span></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="py-6 text-center text-texto-2">Todavía no hay presupuestos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
