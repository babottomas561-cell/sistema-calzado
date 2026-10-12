// Nuevo presupuesto: mismo selector de stock que la caja, pero sin descontar nada.
import { crearCliente } from "@/lib/supabase/server";
import FormPresupuesto from "./FormPresupuesto";
import { exigir } from "@/lib/exigir";
import { leerTodo } from "@/lib/informes";

export default async function NuevoPresupuesto() {
  const { permisos, descuentoMax } = await exigir("ventas.registrar");
  const supabase = await crearCliente();
  const [filas, { data: clientes }, { data: medios }] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, talle, talle_orden, color, sku, codigo_barras, disponible, precio_venta, precio_compra").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_mostrador", true).order("orden"),
  ]);
  // Como en la caja, "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <FormPresupuesto filas={stock as never} clientes={clientes ?? []} medios={medios ?? []}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax} />;
}
