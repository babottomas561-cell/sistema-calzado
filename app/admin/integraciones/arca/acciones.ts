"use server";
// ARCA (fase 1): datos fiscales, ambiente, certificado, prueba de conexión y puntos de venta. Todo lo controla la base (solo el Administrador).
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string; csr?: string };
export type Paso = { paso: string; ok: boolean; texto: string };
const texto = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const refrescar = () => { revalidatePath("/admin/integraciones/arca"); revalidatePath("/admin/integraciones"); };

export async function guardarDatos(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { error: e1 } = await supabase.rpc("guardar_datos_fiscales", {
    p_cuit: texto(f, "cuit", 20), p_razon_social: texto(f, "razon_social"), p_condicion_iva: texto(f, "condicion_iva", 40), p_domicilio: texto(f, "domicilio", 250),
    p_ingresos_brutos: texto(f, "ingresos_brutos", 40) || undefined, p_inicio_actividades: texto(f, "inicio_actividades", 10) || undefined,
  });
  if (e1) return { error: e1.message };
  const { error: e2 } = await supabase.rpc("guardar_configuracion_fiscal", {
    p_alicuota: Number(texto(f, "alicuota", 5)) || 21, p_umbral: Number(texto(f, "umbral", 20).replace(/\D/g, "")) || 10_000_000,
    p_iva_contenido_en_c: texto(f, "iva_contenido_en_c", 10) === "cero" ? "cero" : "leyenda",
  });
  if (e2) return { error: e2.message };
  refrescar();
  return { ok: "Datos fiscales guardados" };
}

export async function cambiarAmbiente(ambiente: "homologacion" | "produccion"): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("arca_cambiar_ambiente", { p_ambiente: ambiente });
  if (error) return { error: error.message };
  refrescar();
  return { ok: ambiente === "produccion" ? "Ahora el sistema usa ARCA de verdad (producción)" : "Ahora el sistema usa el ambiente de pruebas de ARCA" };
}

export async function generarPedido(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("arca_generar_pedido_certificado", { p_alias: texto(f, "alias", 30) || "sistema" });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Pedido de certificado listo: se descargó el archivo para subir a ARCA", csr: data ?? undefined };
}

export async function guardarCertificado(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("arca_guardar_certificado", { p_certificado: String(f.get("certificado") ?? "").trim().slice(0, 16_000) });
  if (error) return { error: error.message };
  refrescar();
  const r = data as { vence?: string } | null;
  return { ok: `Certificado guardado${r?.vence ? `: vale hasta el ${new Date(r.vence).toLocaleDateString("es-AR")}` : ""}. Ahora probá la conexión.` };
}

// Un paso por vez (cada uno corto, para no pasar el límite de tiempo de la base); la pantalla los pide en orden
export async function probarPaso(paso: "servicio" | "acceso" | "puntos_venta"): Promise<Paso> {
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc(paso === "servicio" ? "arca_probar_servicio" : paso === "acceso" ? "arca_probar_acceso" : "arca_probar_puntos_venta");
  if (paso !== "servicio") refrescar();
  return error ? { paso, ok: false, texto: error.message } : (data as unknown as Paso);
}

export async function guardarPunto(id: number, datos: { nombre: string; activo: boolean; por_defecto: boolean }): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("arca_guardar_punto_venta", { p_id: id, p_nombre: datos.nombre, p_activo: datos.activo, p_por_defecto: datos.por_defecto });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Guardado" };
}

export async function agregarPuntoPrueba(numero: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("arca_agregar_punto_venta_prueba", { p_numero: numero });
  if (error) return { error: error.message };
  refrescar();
  return { ok: "Punto de venta agregado" };
}

// Paso 5: prender o apagar la facturación y cómo se usa en la caja. La base controla que esté todo listo.
export async function activarFacturacion(activa: boolean, modo: "todas" | "elegir", serie: "fiscal" | "interna"): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("arca_activar", { p_activa: activa, p_modo: modo, p_serie: serie });
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { ok: activa ? "Listo: la caja ya factura con ARCA" : "Facturación apagada: las ventas salen con comprobante interno" };
}
