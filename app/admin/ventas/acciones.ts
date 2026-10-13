"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { datosFiscales } from "@/lib/fiscal";

export type Estado = { error?: string };

// La venta entera (productos, pagos, cliente) llega como JSON en un solo campo
export async function registrarVenta(_: Estado, f: FormData): Promise<Estado> {
  const venta = JSON.parse(String(f.get("venta") ?? "{}"));
  if (!venta.items?.length) return { error: "Agregá al menos un producto" };
  const supabase = await crearCliente();
  // registrar_venta (en la base) valida stock, descuenta, registra los pagos y deja el historial, todo junto
  const { data: id, error } = await supabase.rpc("registrar_venta", {
    p_items: venta.items, p_pagos: venta.pagos, p_cliente: venta.cliente_id || undefined,
    p_descuento: Number(venta.descuento) || 0, p_canal: venta.canal, p_notas: venta.notas || undefined,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  // Factura de ARCA: la venta ya quedó guardada; si ARCA no contesta, la factura queda en la cola y se reintenta sola
  let factura = "";
  if (f.get("factura") === "1") {
    const { data: fac, error: errFac } = await supabase.rpc("facturar_venta", { p_venta: id });
    const r = fac as { estado?: string } | null;
    factura = errFac ? `&factura_error=${encodeURIComponent(errFac.message.slice(0, 200))}` : r?.estado && r.estado !== "autorizada" ? `&factura=${r.estado}` : "";
  }
  // Qué pasa al confirmar (Impresión → Comprobantes): automática imprime sola, opcional ofrece imprimir o mandar, manual vuelve a la venta
  // (el de quien vende: cada persona del equipo puede tener el suyo)
  const { data: impresion } = await supabase.rpc("impresion_de");
  const modo = impresion?.[0]?.modo ?? "opcional";
  // El vuelto no se guarda: viaja para mostrárselo al cajero en la pantalla siguiente
  const vuelto = Math.max(0, Number(f.get("vuelto")) || 0);
  const extra = (vuelto > 0 ? `&vuelto=${vuelto}` : "") + factura;
  redirect(modo === "manual" ? `/admin/ventas/${id}?nueva=1${extra}` : `/admin/comprobante/venta/${id}?nueva=1${extra}${modo === "automatica" ? "&imprimir=1" : ""}`);
}

// Promociones del mostrador para lo que se está por vender (las mismas que va a aplicar registrar_venta)
export type CotizacionMostrador = { renglones: { variante_id: number; descuento_promo: number; promocion: string | null; acumula: boolean; total: number }[]; descuento_promociones: number };
export async function cotizarMostrador(items: { variante_id: number; cantidad: number; precio_unitario: number }[]): Promise<CotizacionMostrador | null> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("cotizar", { p_items: items, p_canal: "mostrador" });
  return error || !data ? null : (data as unknown as CotizacionMostrador);
}

// Anula una venta del día. La base controla el permiso, el plazo, devuelve el stock y acomoda su pedido o presupuesto.
export async function anularVenta(_: { error?: string; ok?: string }, f: FormData): Promise<{ error?: string; ok?: string }> {
  const venta = Number(f.get("venta_id"));
  const motivo = String(f.get("motivo") ?? "");
  if (!motivo) return { error: "Elegí el motivo de la anulación" };
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("anular_venta", { p_venta: venta, p_motivo: motivo, p_comentario: String(f.get("comentario") ?? "").trim() || undefined });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout"); revalidatePath("/", "layout");
  return { ok: "Venta anulada: el stock ya volvió" };
}

// Alta rápida de un cliente desde la caja (solo nombre y teléfono; el resto se completa después en Clientes). La base controla el permiso (clientes.editar).
export async function crearClienteRapido(nombre: string, telefono: string, fiscal: Record<string, string> = {}): Promise<{ error?: string; cliente?: { id: number; nombre: string; telefono: string | null; documento: string | null; condicion_iva: string; tipo_documento: string } }> {
  const n = nombre.trim(), t = telefono.trim();
  if (!n) return { error: "Falta el nombre" };
  const supabase = await crearCliente();
  if (t) {
    const digitos = t.replace(/\D/g, "");
    const { data: iguales } = await supabase.from("clientes").select("id, nombre, telefono").not("telefono", "is", null).limit(2000);
    const ya = (iguales ?? []).find((c) => digitos.length >= 6 && (c.telefono ?? "").replace(/\D/g, "") === digitos);
    if (ya) return { error: `Ya existe ${ya.nombre} con ese teléfono: buscalo en la lista` };
  }
  // Con los datos para facturar si se cargaron (la base controla el CUIT de las categorías que lo necesitan)
  const { data, error } = await supabase.from("clientes").insert({ nombre: n, telefono: t || null, ...datosFiscales((k) => fiscal[k] ?? null) })
    .select("id, nombre, telefono, documento, condicion_iva, tipo_documento").single();
  if (error) return { error: error.code === "42501" ? "No tenés permiso para crear clientes" : error.message };
  revalidatePath("/admin/clientes");
  return { cliente: data };
}

// Autoriza en la caja un descuento por encima del tope con el PIN de un encargado (la base verifica el PIN, lo limita a 5 intentos y deja la autorización 10 minutos)
export async function autorizarDescuento(pin: string, monto: number): Promise<{ ok: boolean; autoriza?: string; error?: string }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("autorizar_descuento", { p_pin: pin.trim(), p_monto: monto });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; autoriza?: string; error?: string; restantes?: number };
  return r.ok ? { ok: true, autoriza: r.autoriza } : { ok: false, error: r.restantes !== undefined ? `${r.error}. Te quedan ${r.restantes} intentos` : r.error };
}

// Factura de ARCA de una venta ya hecha (si se vendió con comprobante interno, o la factura quedó rechazada y se corrigió el dato)
export async function facturarVenta(venta: number): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("facturar_venta", { p_venta: venta });
  revalidatePath(`/admin/ventas/${venta}`);
  if (error) return { error: error.message };
  return resultadoFactura(data);
}
export async function reintentarFactura(factura: number, venta: number): Promise<{ error?: string; ok?: string }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("reintentar_factura", { p_factura: factura });
  revalidatePath(`/admin/ventas/${venta}`);
  if (error) return { error: error.message };
  return resultadoFactura(data);
}
function resultadoFactura(data: unknown): { error?: string; ok?: string } {
  const r = data as { estado: string; letra: string; comprobante: string | null; error: string | null };
  if (r.estado === "autorizada") return { ok: `Factura ${r.letra} ${r.comprobante} autorizada por ARCA` };
  if (r.estado === "rechazada") return { error: r.error ?? "ARCA rechazó la factura" };
  return { ok: "ARCA no contestó: la factura quedó en la cola y se reintenta sola en unos minutos" };
}

// Buscar la venta para un cambio o una devolución desde la caja (ticket escaneado, número de factura, cliente o teléfono). La base la encuentra aunque
// la haya hecho otro vendedor, sin mostrar montos.
export type VentaParaCambio = { id: number; comprobante: string; fecha: string; cliente: string | null; productos: string | null; en_plazo: boolean; factura: string | null };
export async function buscarParaCambio(q: string): Promise<{ error?: string; ventas?: VentaParaCambio[] }> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("ventas_para_cambio", { p_buscar: q.trim().replace(/'/g, "-") });
  if (error) return { error: error.message };
  return { ventas: (data ?? []) as unknown as VentaParaCambio[] };
}
