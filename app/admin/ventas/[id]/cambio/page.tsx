// Cambio: lo que trae (como una devolución) y lo que se lleva, en una sola operación.
import { notFound, redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { leerTodo } from "@/lib/informes";
import { fechaHora } from "@/lib/formato";
import Volver from "@/components/Volver";
import FormCambio from "./FormCambio";

export default async function Cambio({ params }: { params: Promise<{ id: string }> }) {
  const { permisos } = await exigir("ventas.registrar");
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: v }, { data: items }, { data: devueltos }, filas, { data: medios }, { data: config }] = await Promise.all([
    supabase.from("ventas").select("id, comprobante, fecha, anulada_en, cliente_id, clientes(nombre)").eq("id", Number(id)).single(),
    supabase.from("v_venta_items").select("id, producto_id, nombre, talle, color, cantidad, precio_unitario, descuento_promo, promocion").eq("venta_id", Number(id)).order("id"),
    supabase.from("devolucion_items").select("venta_item_id, cantidad, devoluciones!inner(venta_id)").eq("devoluciones.venta_id", Number(id)),
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, talle, talle_orden, color, sku, disponible, precio_venta, precio_compra").order("variante_id").range(a, b)),
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_mostrador", true).eq("es_saldo", false).order("orden"),
    supabase.from("configuracion_tienda").select("dias_cambio").single(),
  ]);
  if (!v) notFound();
  if (v.anulada_en) redirect(`/admin/ventas/${v.id}`);
  const yaDevuelto = new Map<number, number>();
  (devueltos ?? []).forEach((d) => yaDevuelto.set(d.venta_item_id, (yaDevuelto.get(d.venta_item_id) ?? 0) + d.cantidad));
  const renglones = (items ?? []).map((i) => ({ id: i.id ?? 0, producto_id: i.producto_id ?? 0, nombre: i.nombre ?? "", talle: i.talle ?? "", color: i.color ?? "",
    precio: Number(i.precio_unitario), promocion: Number(i.descuento_promo) > 0 ? i.promocion : null,
    quedan: (i.cantidad ?? 0) - (yaDevuelto.get(i.id ?? 0) ?? 0) })).filter((r) => r.quedan > 0);
  const { data: clientes } = v.cliente_id ? { data: [] } : await supabase.from("clientes").select("id, nombre").order("nombre");
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Volver href={`/admin/ventas/${v.id}`}>Venta {v.comprobante}</Volver>
      <div><h1 className="text-2xl font-bold">Cambio</h1>
        <p className="text-sm text-texto-2">Venta <span className="font-mono">{v.comprobante}</span> del {fechaHora(v.fecha)}
          {v.cliente_id ? ` · ${(v.clientes as { nombre: string } | null)?.nombre}` : " · sin cliente"}</p></div>
      {renglones.length === 0
        ? <p className="tarjeta text-sm text-texto-2">Ya se devolvió todo lo de esta venta.</p>
        : <FormCambio venta={v.id} renglones={renglones} filas={stock as never} medios={medios ?? []} clientes={clientes ?? []}
            conCliente={!!v.cliente_id} diasCambio={config?.dias_cambio ?? 30} excepcion={puede(permisos, "devoluciones.fuera_de_plazo")} />}
    </div>
  );
}
