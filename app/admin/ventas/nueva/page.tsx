// Nueva venta de mostrador (la caja): trae el stock disponible con su foto, los clientes, los medios de pago y si la impresión de
// comprobantes ya está configurada (si no, la caja lo avisa).
import { crearCliente } from "@/lib/supabase/server";
import PuntoDeVenta from "./PuntoDeVenta";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { leerTodo } from "@/lib/informes";
import { leerRequisitos } from "@/components/Requisitos";

export default async function NuevaVenta() {
  const { permisos, descuentoMax } = await exigir("ventas.registrar");
  const supabase = await crearCliente();
  const frenan = (await leerRequisitos("vender")).filter((r) => r.bloquea);
  const [filas, { data: clientes }, { data: medios }, { data: saldos }, { data: impresion }, { data: mia }, { data: vendidos }, { data: fiscal }, { data: confPagos }, { data: point }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, categoria, talle, talle_orden, color, color_hex, sku, codigo_barras, disponible, precio_venta, precio_lista, precio_compra, imagen_url").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre, telefono, documento, condicion_iva, tipo_documento").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, tipo, ajuste_pct, cuotas, es_saldo, siempre_factura, es_cuenta_corriente").eq("activo", true).eq("en_mostrador", true).order("orden"),
    supabase.from("v_saldo_clientes").select("cliente_id, disponible"),
    supabase.from("configuracion_impresion").select("comprobante_configurado").maybeSingle(),
    supabase.rpc("impresion_de"),
    supabase.rpc("mas_vendidos_caja", { p_dias: 30, p_limite: 8 }),
    supabase.rpc("facturacion_caja"),   // si ARCA está activa: factura o comprobante interno
    supabase.from("configuracion_tienda").select("transferencia_comprobante").maybeSingle(),
    supabase.rpc("point_caja"),   // posnet de Mercado Pago, si está vinculado
  ]);
  // Con la regla «solo con el posnet» y sin posnet disponible, Débito y Crédito no se ofrecen (la base igual lo frena)
  const pt = point as { disponible: boolean; modo: string } | null;
  const sinTarjetas = pt?.modo === "vinculado" && !pt.disponible;
  const mediosCaja = (medios ?? []).filter((m) => !(sinTarjetas && (m.tipo === "Débito" || m.tipo === "Crédito")));
  const f = fiscal as { activa: boolean; modo: "todas" | "elegir"; serie_por_defecto: "fiscal" | "interna"; letra: string | null; puede: boolean; sin_factura: boolean; ambiente: string; umbral: number } | null;
  // Saldo a favor de cada cliente (para cobrar con «Saldo a favor»)
  const saldo = new Map((saldos ?? []).map((s) => [s.cliente_id, Number(s.disponible)]));
  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  // y el precio es el de la lista del mostrador (si las listas están apagadas, es el de siempre)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0, precio_venta: f.precio_lista ?? f.precio_venta }));
  return <PuntoDeVenta requisitoFalta={frenan[0]?.mensaje ?? null} point={point as { disponible: boolean; modo: string; terminal: string | null; qr?: boolean } | null} exigeOperacion={(confPagos?.transferencia_comprobante ?? "no") !== "no"} filas={stock as never} clientes={(clientes ?? []).map((c) => ({ ...c, saldo: saldo.get(c.id) ?? 0 }))} medios={mediosCaja} sinTarjetas={sinTarjetas}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax} masVendidos={(vendidos ?? []).map((v) => v.producto_id)} puedeCrearCliente={puede(permisos, "clientes.editar")}
    facturacion={f?.activa && f.puede && f.letra ? { modo: f.sin_factura ? f.modo : "todas", porDefecto: f.serie_por_defecto, letra: f.letra, pruebas: f.ambiente === "homologacion", umbral: Number(f.umbral) } : null}
    impresion={{ configurada: !!impresion?.comprobante_configurado, modo: mia?.[0]?.modo ?? "opcional", puedeConfigurar: puede(permisos, "tablas.editar") }} />;
}
