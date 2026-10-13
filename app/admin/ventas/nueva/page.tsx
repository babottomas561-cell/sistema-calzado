// Nueva venta de mostrador (la caja): trae el stock disponible con su foto, los clientes, los medios de pago y si la impresión de
// comprobantes ya está configurada (si no, la caja lo avisa).
import { crearCliente } from "@/lib/supabase/server";
import PuntoDeVenta from "./PuntoDeVenta";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { leerTodo } from "@/lib/informes";

export default async function NuevaVenta() {
  const { permisos, descuentoMax } = await exigir("ventas.registrar");
  const supabase = await crearCliente();
  const [filas, { data: clientes }, { data: medios }, { data: saldos }, { data: impresion }, { data: mia }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, categoria, talle, talle_orden, color, color_hex, sku, codigo_barras, disponible, precio_venta, precio_compra, imagen_url").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre, telefono").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, tipo, ajuste_pct, cuotas, es_saldo").eq("activo", true).eq("en_mostrador", true).order("orden"),
    supabase.from("v_saldo_clientes").select("cliente_id, disponible"),
    supabase.from("configuracion_impresion").select("comprobante_configurado").maybeSingle(),
    supabase.rpc("impresion_de"),
  ]);
  // Saldo a favor de cada cliente (para cobrar con «Saldo a favor»)
  const saldo = new Map((saldos ?? []).map((s) => [s.cliente_id, Number(s.disponible)]));
  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <PuntoDeVenta filas={stock as never} clientes={(clientes ?? []).map((c) => ({ ...c, saldo: saldo.get(c.id) ?? 0 }))} medios={medios ?? []}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax}
    impresion={{ configurada: !!impresion?.comprobante_configurado, modo: mia?.[0]?.modo ?? "opcional", puedeConfigurar: puede(permisos, "tablas.editar") }} />;
}
