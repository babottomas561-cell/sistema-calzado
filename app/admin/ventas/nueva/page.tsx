// Nueva venta de mostrador: trae el stock disponible, los clientes y los medios de pago del local.
import { crearCliente } from "@/lib/supabase/server";
import PuntoDeVenta from "./PuntoDeVenta";

export default async function NuevaVenta() {
  const supabase = await crearCliente();
  const [{ data: filas }, { data: clientes }, { data: medios }] = await Promise.all([
    supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, talle, talle_orden, color, sku, disponible, precio_venta, precio_compra"),
    supabase.from("clientes").select("id, nombre").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_mostrador", true).order("orden"),
  ]);
  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = (filas ?? []).map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <PuntoDeVenta filas={stock as never} clientes={clientes ?? []} medios={medios ?? []} />;
}
