"use server";
// Acciones para administrar sucursales, puntos de venta y transferencias de stock entre depósitos.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { ok?: string; error?: string };

export async function guardarSucursal(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const codigo = String(f.get("codigo") ?? "").trim().toUpperCase();
  const nombre = String(f.get("nombre") ?? "").trim();
  const direccion = String(f.get("direccion") ?? "").trim() || null;
  const telefono = String(f.get("telefono") ?? "").trim() || null;
  const depositoId = Number(f.get("deposito_id")) || null;
  const activa = f.get("activa") === "1" || f.get("activa") === "on";

  if (!codigo || !nombre) return { error: "Código y nombre son obligatorios" };

  const supabase = await crearCliente();
  if (id) {
    const { error } = await supabase.from("sucursales").update({
      codigo,
      nombre,
      direccion,
      telefono,
      deposito_id: depositoId,
      activa,
      actualizado_en: new Date().toISOString(),
    }).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("sucursales").insert({
      codigo,
      nombre,
      direccion,
      telefono,
      deposito_id: depositoId,
      activa,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/ventas/nueva");
  return { ok: id ? "Sucursal actualizada" : "Sucursal creada" };
}

export async function guardarPuntoVenta(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const sucursalId = Number(f.get("sucursal_id"));
  const numero = Number(f.get("numero"));
  const nombre = String(f.get("nombre") ?? "").trim();
  const tipo = String(f.get("tipo") ?? "mostrador");
  const activo = f.get("activo") === "1" || f.get("activo") === "on";

  if (!sucursalId || !numero || !nombre) return { error: "Sucursal, número y nombre son obligatorios" };

  const supabase = await crearCliente();
  if (id) {
    const { error } = await supabase.from("puntos_venta").update({
      numero,
      nombre,
      tipo,
      activo,
    }).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("puntos_venta").insert({
      sucursal_id: sucursalId,
      numero,
      nombre,
      tipo,
      activo,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/ventas/nueva");
  return { ok: id ? "Punto de venta actualizado" : "Punto de venta creado" };
}

export async function guardarDeposito(_: Estado, f: FormData): Promise<Estado> {
  const id = Number(f.get("id")) || null;
  const nombre = String(f.get("nombre") ?? "").trim();
  const sucursalId = Number(f.get("sucursal_id")) || null;
  const vendible = f.get("vendible") === "1" || f.get("vendible") === "on";
  const activo = f.get("activo") === "1" || f.get("activo") === "on";

  if (!nombre) return { error: "El nombre del depósito es obligatorio" };

  const supabase = await crearCliente();
  if (id) {
    const { error } = await supabase.from("depositos").update({
      nombre,
      sucursal_id: sucursalId,
      vendible,
      activo,
    }).eq("id", id);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("depositos").insert({
      nombre,
      sucursal_id: sucursalId,
      vendible,
      activo,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/stock");
  return { ok: id ? "Depósito actualizado" : "Depósito creado" };
}

export async function transferirStockEntreDepositos(_: Estado, f: FormData): Promise<Estado> {
  const varianteId = Number(f.get("variante_id"));
  const origenId = Number(f.get("origen_id"));
  const destinoId = Number(f.get("destino_id"));
  const cantidad = Number(f.get("cantidad"));
  const motivo = String(f.get("motivo") ?? "").trim() || undefined;

  if (!varianteId || !origenId || !destinoId || !cantidad || cantidad <= 0) {
    return { error: "Completá todos los datos de la transferencia" };
  }

  const supabase = await crearCliente();
  const { error } = await supabase.rpc("transferir_stock", {
    p_variante: varianteId,
    p_origen: origenId,
    p_destino: destinoId,
    p_cantidad: cantidad,
    p_motivo: motivo,
  });

  if (error) return { error: error.message };
  revalidatePath("/admin/sucursales");
  revalidatePath("/admin/stock");
  return { ok: "Transferencia de stock registrada con éxito" };
}
