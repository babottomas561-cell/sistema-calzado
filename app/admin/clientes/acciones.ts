"use server";
// CRM: alta y edición de clientes, y sus interacciones (seguimientos).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { datosFiscales } from "@/lib/fiscal";

export type Estado = { error?: string; ok?: string };
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

function datosCliente(f: FormData) {
  return {
    nombre: String(f.get("nombre") ?? "").trim(),
    documento: texto(f, "documento"), telefono: texto(f, "telefono"), email: texto(f, "email"),
    direccion: texto(f, "direccion"), localidad: texto(f, "localidad"),
    fecha_nacimiento: texto(f, "fecha_nacimiento"), origen: texto(f, "origen"), notas: texto(f, "notas"),
    etiquetas: String(f.get("etiquetas") ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
    acepta_promos: f.get("acepta_promos") === "on",
    // Datos para facturar (la base controla el CUIT de las categorías que lo necesitan)
    ...datosFiscales((k) => (f.has(k) ? String(f.get(k)) : null)),
  };
}

export async function guardarCliente(_: Estado, f: FormData): Promise<Estado> {
  const datos = datosCliente(f);
  if (!datos.nombre) return { error: "Falta el nombre" };
  const supabase = await crearCliente();
  const id = f.get("id");
  if (id) {
    const { error } = await supabase.from("clientes").update(datos).eq("id", Number(id));
    if (error) return { error: error.message };
    revalidatePath(`/admin/clientes/${id}`);
    return { ok: "Guardado" };
  }
  const { data, error } = await supabase.from("clientes").insert(datos).select("id").single();
  if (error) return { error: error.message };
  redirect(`/admin/clientes/${data.id}`);
}

export async function nuevaInteraccion(_: Estado, f: FormData): Promise<Estado> {
  const clienteId = Number(f.get("cliente_id"));
  const detalle = String(f.get("detalle") ?? "").trim();
  if (!detalle) return { error: "Escribí qué pasó" };
  const supabase = await crearCliente();
  const { error } = await supabase.from("interacciones").insert({
    cliente_id: clienteId, tipo: String(f.get("tipo")), canal: texto(f, "canal"), detalle,
    proxima_accion: texto(f, "proxima_accion"), proxima_fecha: texto(f, "proxima_fecha"),
    hecha: !f.get("proxima_accion"),   // si no hay próxima acción, queda cerrada
  });
  if (error) return { error: error.message };
  revalidatePath(`/admin/clientes/${clienteId}`);
  revalidatePath("/admin/seguimientos");
  return { ok: "Registrado" };
}

export async function marcarHecha(f: FormData) {
  const supabase = await crearCliente();
  await supabase.from("interacciones").update({ hecha: true }).eq("id", Number(f.get("id")));
  revalidatePath(`/admin/clientes/${f.get("cliente_id")}`);
  revalidatePath("/admin/seguimientos");
}
