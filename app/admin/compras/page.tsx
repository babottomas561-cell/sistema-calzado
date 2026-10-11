import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, fechaHora, pesos } from "@/lib/formato";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";
import { Plus } from "lucide-react";
import { exigir } from "@/lib/exigir";

export default async function Compras() {
  await exigir("compras.registrar");
  const supabase = await crearCliente();
  const { data: compras, error } = await supabase.from("compras")
    .select("id, comprobante, comprobante_proveedor, fecha_comprobante, fecha, total, notas, proveedores(nombre), compra_items(cantidad)").order("fecha", { ascending: false }).limit(200);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Compras</h1>
        <Link href="/admin/compras/nueva" className="boton"><Plus size={16} /> Cargar factura de compra</Link>
      </div>
      {error && <p className="text-error">{error.message}</p>}
      <ListaMovil vacio={compras?.length === 0 && "Todavía no hay compras."}>
        {(compras ?? []).map((c) => (
          <FilaMovil key={c.id} href={`/admin/compras/${c.id}`}
            titulo={(c.proveedores as unknown as { nombre: string } | null)?.nombre ?? "Sin proveedor"}
            detalle={<>{fechaHora(c.fecha)} · <span className="font-mono">{c.comprobante}</span>{c.comprobante_proveedor ? ` · fact. ${c.comprobante_proveedor}` : ""}</>}
            valor={<><div className="font-bold">{pesos(c.total)}</div><div className="text-xs text-texto-2">{(c.compra_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0)} pares</div></>} />
        ))}
      </ListaMovil>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Compra</th><th>Cargada</th><th>Proveedor</th><th>Factura/remito</th><th className="text-right">Pares</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {(compras ?? []).map((c) => (
              <tr key={c.id}>
                <td><Link href={`/admin/compras/${c.id}`} className="font-mono font-semibold text-marca">{c.comprobante}</Link></td>
                <td>{fechaHora(c.fecha)}</td>
                <td>{(c.proveedores as unknown as { nombre: string } | null)?.nombre ?? "—"}</td>
                <td className="text-texto-2">{c.comprobante_proveedor ?? ""}{c.fecha_comprobante ? <div className="text-xs">del {fecha(c.fecha_comprobante + "T12:00:00")}</div> : null}</td>
                <td className="text-right">{(c.compra_items as { cantidad: number }[]).reduce((s, i) => s + i.cantidad, 0)}</td>
                <td className="text-right font-semibold">{pesos(c.total)}</td>
              </tr>
            ))}
            {compras?.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-texto-2">Todavía no hay compras.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
