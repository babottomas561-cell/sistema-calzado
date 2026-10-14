// Nueva venta de mostrador (la caja): trae el stock disponible con su foto, los clientes, los medios de pago y si la impresión de
// comprobantes ya está configurada (si no, la caja lo avisa).
import { crearCliente } from "@/lib/supabase/server";
import PuntoDeVenta from "./PuntoDeVenta";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { leerTodo } from "@/lib/informes";

export default async function NuevaVenta() {
  const { permisos, descuentoMax, user } = await exigir("ventas.registrar");
  const supabase = await crearCliente();
  const [filas, { data: clientes }, { data: medios }, { data: saldos }, { data: saldosCC }, { data: tiendaConfig }, { data: impresion }, { data: mia }, { data: vendidos }, { data: fiscal }, { data: listasPrecios }, { data: excepcionesPrecios }, { data: miPerfil }] = await Promise.all([
    // De a páginas: con muchos modelos se pasa de las 1000 filas por consulta
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, marca, categoria, talle, talle_orden, color, color_hex, sku, codigo_barras, disponible, precio_venta, precio_compra, imagen_url").order("variante_id").range(a, b)),
    supabase.from("clientes").select("id, nombre, telefono, documento, condicion_iva, tipo_documento").order("nombre"),
    supabase.from("medios_pago").select("id, nombre, tipo, ajuste_pct, cuotas, es_saldo, es_cuenta_corriente, siempre_factura").eq("activo", true).eq("en_mostrador", true).order("orden"),
    supabase.from("v_saldo_clientes").select("cliente_id, disponible"),
    supabase.from("v_cuenta_corriente_saldos").select("cliente_id, saldo_deudor"),
    supabase.from("configuracion_tienda").select("cuenta_corriente_clientes, listas_precios_activas, multisucursal_activa").single(),
    supabase.from("configuracion_impresion").select("comprobante_configurado").maybeSingle(),
    supabase.rpc("impresion_de"),
    supabase.rpc("mas_vendidos_caja", { p_dias: 30, p_limite: 8 }),
    supabase.rpc("facturacion_caja"),   // si ARCA está activa: factura o comprobante interno
    supabase.from("listas_precios").select("id, codigo, nombre, canal, ajuste_pct, redondeo, es_default_local").eq("activa", true).order("id"),
    supabase.from("lista_precio_items").select("lista_id, producto_id, precio"),
    supabase.from("perfiles").select("sucursal_id, punto_venta_id, sucursales(nombre), puntos_venta(nombre, numero)").eq("id", user!.id).maybeSingle(),
  ]);
  const f = fiscal as { activa: boolean; modo: "todas" | "elegir"; serie_por_defecto: "fiscal" | "interna"; letra: string | null; puede: boolean; sin_factura: boolean; ambiente: string; umbral: number } | null;
  // Saldo a favor de cada cliente (para cobrar con «Saldo a favor») y deuda en cta. cte.
  const saldo = new Map((saldos ?? []).map((s) => [s.cliente_id, Number(s.disponible)]));
  const saldoCC = new Map((saldosCC ?? []).map((s) => [s.cliente_id, Number(s.saldo_deudor)]));
  const ccActiva = !!tiendaConfig?.cuenta_corriente_clientes;
  const mediosFiltrados = (medios ?? []).filter((m) => !m.es_cuenta_corriente || ccActiva);

  // Listas de precios solo si están activas
  const listasActivas = tiendaConfig?.listas_precios_activas ? (listasPrecios ?? []) : [];
  const excepciones = tiendaConfig?.listas_precios_activas ? (excepcionesPrecios ?? []) : [];

  // Sucursal asignada al cajero (si multisucursal está encendida)
  type SucursalRel = { nombre: string };
  type PuntoVentaRel = { nombre: string; numero: number };
  const sucursalNombre = (miPerfil?.sucursales as unknown as SucursalRel | null)?.nombre;
  const pvRel = miPerfil?.puntos_venta as unknown as PuntoVentaRel | null;
  const sucursalActual = (tiendaConfig?.multisucursal_activa && miPerfil?.sucursal_id && sucursalNombre) ? {
    id: miPerfil.sucursal_id,
    nombre: sucursalNombre,
    puntoVenta: pvRel ? `${pvRel.nombre} (P.V. ${pvRel.numero})` : undefined,
  } : null;

  // El selector trabaja con "stock" = lo disponible (descontando lo reservado en pedidos)
  const stock = filas.map((f) => ({ ...f, stock: f.disponible ?? 0 }));
  return <PuntoDeVenta filas={stock as never} clientes={(clientes ?? []).map((c) => ({ ...c, saldo: saldo.get(c.id) ?? 0, saldoDeudor: saldoCC.get(c.id) ?? 0 }))} medios={mediosFiltrados}
    cambiaPrecio={permisos.includes("ventas.cambiar_precio")} descuentoMax={descuentoMax} masVendidos={(vendidos ?? []).map((v) => v.producto_id)} puedeCrearCliente={puede(permisos, "clientes.editar")}
    facturacion={f?.activa && f.puede && f.letra ? { modo: f.sin_factura ? f.modo : "todas", porDefecto: f.serie_por_defecto, letra: f.letra, pruebas: f.ambiente === "homologacion", umbral: Number(f.umbral) } : null}
    impresion={{ configurada: !!impresion?.comprobante_configurado, modo: mia?.[0]?.modo ?? "opcional", puedeConfigurar: puede(permisos, "tablas.editar") }}
    listasPrecios={listasActivas} excepcionesPrecios={excepciones} sucursalActual={sucursalActual} />;
}
