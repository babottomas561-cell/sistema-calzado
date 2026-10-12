// Cargar una factura de compra: todo lo que hace falta para cargarla por curva (talle × color),
// con los precios de cada proveedor y el alta rápida de artículos nuevos.
import { crearCliente } from "@/lib/supabase/server";
import { leerMaestros } from "@/lib/maestros";
import FacturaCompra from "./FacturaCompra";
import { exigir } from "@/lib/exigir";
import { leerTodo } from "@/lib/informes";

export default async function NuevaCompra() {
  const { permisos } = await exigir("compras.registrar");
  const supabase = await crearCliente();
  const [filas, { data: proveedores }, { data: precios }, maestros, { data: creditos }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, codigo, nombre, marca, talle, talle_orden, color, color_hex, sku, codigo_barras, stock, precio_compra").order("variante_id").range(a, b)),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("producto_proveedores").select("producto_id, proveedor_id, codigo_proveedor, precio_compra"),
    leerMaestros(),
    // Crédito a favor del local con cada proveedor (fallados devueltos): se propone descontarlo
    supabase.from("v_credito_proveedores").select("proveedor_id, saldo").gt("saldo", 0),
  ]);
  return <FacturaCompra editaPrecio={permisos.includes("precios.editar")} filas={filas as never} proveedores={proveedores ?? []} precios={(precios ?? []) as never} {...maestros}
    creditos={Object.fromEntries((creditos ?? []).map((c) => [c.proveedor_id, Number(c.saldo)]))} />;
}
