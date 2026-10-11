// Listado de ventas por período, con totales por medio de pago.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, inicioDe, pesos } from "@/lib/formato";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";
import { Plus } from "lucide-react";

const PERIODOS = { hoy: "Hoy", mes: "Este mes", todo: "Todo" } as const;

export default async function Ventas({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo: p = "mes" } = await searchParams;
  const periodo = (p in PERIODOS ? p : "mes") as keyof typeof PERIODOS;
  const supabase = await crearCliente();
  let consulta = supabase.from("ventas").select("id, comprobante, fecha, total, descuento, canal, pedido_id, clientes(nombre), venta_items(cantidad), ajuste_medio_pago, pagos(monto, medios_pago(nombre))")
    .order("fecha", { ascending: false }).limit(500);
  if (periodo !== "todo") consulta = consulta.gte("fecha", inicioDe(periodo));
  const { data: ventas, error } = await consulta;

  const lista = ventas ?? [];
  const total = lista.reduce((s, v) => s + Number(v.total), 0);
  // Lo que entró por cada medio (ya con su descuento o recargo): es lo que tiene que haber en caja / banco
  type Pago = { monto: number; medios_pago: { nombre: string } };
  const porMedio = new Map<string, number>();
  lista.forEach((v) => (v.pagos as unknown as Pago[]).forEach((p) => porMedio.set(p.medios_pago.nombre, (porMedio.get(p.medios_pago.nombre) ?? 0) + Number(p.monto))));
  const ajustes = lista.reduce((s, v) => s + Number(v.ajuste_medio_pago), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Link href="/admin/ventas/nueva" className="boton"><Plus size={16} /> Nueva venta</Link>
      </div>
      <div className="flex gap-2">
        {Object.entries(PERIODOS).map(([k, t]) => (
          <Link key={k} href={`/admin/ventas?periodo=${k}`} className={`rounded-lg border px-3 py-1.5 text-sm ${k === periodo ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{t}</Link>
        ))}
      </div>
      {error && <p className="text-error">{error.message}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="tarjeta col-span-2"><div className="etiqueta">Total {PERIODOS[periodo].toLowerCase()}</div>
          <div className="text-2xl font-bold">{pesos(total)}</div><div className="text-xs text-texto-2">{lista.length} ventas{ajustes ? ` · ${ajustes < 0 ? "descuentos" : "recargos"} por medio de pago ${pesos(Math.abs(ajustes))}` : ""}</div></div>
        {[...porMedio.entries()].sort((a, b) => b[1] - a[1]).map(([m, v]) => (
          <div key={m} className="tarjeta"><div className="etiqueta">{m}</div><div className="font-bold">{pesos(v)}</div></div>
        ))}
      </div>

      <ListaMovil vacio={lista.length === 0 && "No hay ventas en este período."}>
        {lista.map((v) => (
          <FilaMovil key={v.id} href={`/admin/ventas/${v.id}`}
            titulo={(v.clientes as unknown as { nombre: string } | null)?.nombre ?? "Sin cliente"}
            detalle={<>{fechaHora(v.fecha)} · <span className="font-mono">{v.comprobante}</span></>}
            extra={<><span className="chip bg-gray-100">{v.canal}</span>{v.pedido_id ? <span className="chip bg-blue-50 text-marca">pedido</span> : null}
              <span className="chip bg-gray-100 text-texto-2">{[...new Set((v.pagos as unknown as Pago[]).map((p) => p.medios_pago.nombre))].join(" + ") || "—"}</span></>}
            valor={<><div className="font-bold">{pesos(v.total)}</div><div className="text-xs text-texto-2">{(v.venta_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0)} pares</div></>} />
        ))}
      </ListaMovil>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Canal</th><th>Pago</th><th className="text-right">Pares</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/admin/ventas/${v.id}`} className="font-mono font-semibold text-marca">{v.comprobante}</Link></td>
                <td>{fechaHora(v.fecha)}</td>
                <td>{(v.clientes as unknown as { nombre: string } | null)?.nombre ?? "—"}</td>
                <td>{v.canal}{v.pedido_id ? <span className="chip ml-1 bg-blue-50 text-marca">pedido</span> : null}</td>
                <td className="text-texto-2">{[...new Set((v.pagos as unknown as Pago[]).map((p) => p.medios_pago.nombre))].join(" + ") || "—"}</td>
                <td className="text-right">{(v.venta_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0)}</td>
                <td className="text-right font-semibold">{pesos(v.total)}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-texto-2">No hay ventas en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
