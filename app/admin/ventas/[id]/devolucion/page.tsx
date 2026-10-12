// Devolución de una venta: qué vuelve, en qué estado y por qué. El saldo a favor lo calcula la base.
import { notFound, redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { fechaHora } from "@/lib/formato";
import Volver from "@/components/Volver";
import { renglonesDevolvibles, volverDe, type VentaParaCambio } from "@/lib/cambios";
import FormDevolucion from "./FormDevolucion";

export default async function Devolucion({ params }: { params: Promise<{ id: string }> }) {
  const { permisos } = await exigir("ventas.registrar");
  const { id } = await params;
  const supabase = await crearCliente();
  // Por la base (venta_para_cambio): funciona aunque la venta la haya hecho otro vendedor
  const [{ data }, { data: config }] = await Promise.all([
    supabase.rpc("venta_para_cambio", { p_venta: Number(id) }),
    supabase.from("configuracion_tienda").select("dias_cambio").single(),
  ]);
  const v = data as unknown as VentaParaCambio | null;
  if (!v) notFound();
  if (v.anulada) redirect(v.visible ? `/admin/ventas/${v.id}` : "/admin/devoluciones");
  const renglones = renglonesDevolvibles(v);
  const volver = volverDe(v);
  // Si la venta no tenía cliente, hay que elegirlo: el saldo a favor queda a su nombre
  const { data: clientes } = v.cliente_id ? { data: [] } : await supabase.from("clientes").select("id, nombre").order("nombre");

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Volver href={volver.href}>{volver.texto}</Volver>
      <div><h1 className="text-2xl font-bold">Devolución</h1>
        <p className="text-sm text-texto-2">Venta <span className="font-mono">{v.comprobante}</span> del {fechaHora(v.fecha)}
          {v.cliente ? ` · ${v.cliente}` : " · sin cliente"}</p></div>
      {renglones.length === 0
        ? <p className="tarjeta text-sm text-texto-2">Ya se devolvió todo lo de esta venta.</p>
        : <FormDevolucion venta={v.id} renglones={renglones} clientes={clientes ?? []} conCliente={!!v.cliente_id}
            diasCambio={config?.dias_cambio ?? 30} excepcion={puede(permisos, "devoluciones.fuera_de_plazo")} />}
    </div>
  );
}
