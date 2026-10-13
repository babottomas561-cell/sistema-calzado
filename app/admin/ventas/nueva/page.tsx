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
  const [filas, { data: clientes }, { data: medios }, { data: saldos }, { data: impresion }, { data: mia }, { data: vendidos }, { data: fiscal }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, categoria, talle, talle_orden, color, color_hex, sku, codigo_barras, disponible, precio_venta, precio_compra, imagen_url").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre, telefono, documento").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, tipo, ajuste_pct, cuotas, es_saldo, siempre_factura").eq("activo", true).eq("en_mostrador", true).order("orden"),
    supabase.from("v_saldo_clientes").select("cliente_id, disponible"),
    supabase.from("configuracion_impresion").select("comprobante_configurado").maybeSingle(),
    supabase.rpc("impresion_de"),
    supabase.rpc("mas_vendidos_caja", { p_dias: 30, p_limite: 8 }),
    supabase.rpc("facturacion_caja"),   // si ARCA está activa: factura o comprobante interno
  ]);
  const f = fiscal as { activa: boolean; modo: "todas" | "elegir"; serie_por_defecto: "fiscal" | "interna"; letra: string | null; puede: boolean; sin_factura: boolean; ambiente: string; umbral: number } | null;
  // Saldo a favor de cada cliente (para cobrar con «Saldo a favor»)
  const saldo = new Map((saldos ?? []).map((s) => [s.cliente_id, Number(s.disponible)]));
  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <PuntoDeVenta filas={stock as never} clientes={(clientes ?? []).map((c) => ({ ...c, saldo: saldo.get(c.id) ?? 0 }))} medios={medios ?? []}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax} masVendidos={(vendidos ?? []).map((v) => v.producto_id)} puedeCrearCliente={puede(permisos, "clientes.editar")}
    facturacion={f?.activa && f.puede && f.letra ? { modo: f.sin_factura ? f.modo : "todas", porDefecto: f.serie_por_defecto, letra: f.letra, pruebas: f.ambiente === "homologacion", umbral: Number(f.umbral) } : null}
    impresion={{ configurada: !!impresion?.comprobante_configurado, modo: mia?.[0]?.modo ?? "opcional", puedeConfigurar: puede(permisos, "tablas.editar") }} />;
}
