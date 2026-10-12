// Nueva venta de mostrador: trae el stock disponible, los clientes y los medios de pago del local.
import { crearCliente } from "@/lib/supabase/server";
import PuntoDeVenta from "./PuntoDeVenta";
import { exigir } from "@/lib/exigir";
import { leerTodo } from "@/lib/informes";

export default async function NuevaVenta() {
  const { permisos, descuentoMax } = await exigir("ventas.registrar");
  const supabase = await crearCliente();
  const [filas, { data: clientes }, { data: medios }, { data: saldos }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, talle, talle_orden, color, sku, codigo_barras, disponible, precio_venta, precio_compra").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas, es_saldo").eq("activo", true).eq("en_mostrador", true).order("orden"),
    supabase.from("v_saldo_clientes").select("cliente_id, disponible"),
  ]);
  // Saldo a favor de cada cliente (para cobrar con «Saldo a favor»)
  const saldo = new Map((saldos ?? []).map((s) => [s.cliente_id, Number(s.disponible)]));
  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <PuntoDeVenta filas={stock as never} clientes={(clientes ?? []).map((c) => ({ ...c, saldo: saldo.get(c.id) ?? 0 }))} medios={medios ?? []}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax} />;
}
