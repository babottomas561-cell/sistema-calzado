"use server";
// Equipo: quién está en el equipo y con qué rol, y qué puede hacer cada rol.
// Todo lo valida la base (asignar_rol, quitar_del_equipo, políticas de roles): acá solo se traduce.
import { revalidatePath } from "next/cache";
import { crearCliente } from "@/lib/supabase/server";

export type Estado = { error?: string; ok?: string };

export async function sumarAlEquipo(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const email = String(f.get("email") ?? "").trim();
  if (!email) return { error: "Escribí el email con el que se registró" };
  const { error } = await supabase.rpc("asignar_rol", { p_email: email, p_rol: Number(f.get("rol_id")) });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo");
  return { ok: `Listo: ${email} ya es parte del equipo` };
}

export async function cambiarRol(email: string, rolId: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("asignar_rol", { p_email: email, p_rol: rolId });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo");
  return { ok: "Rol cambiado" };
}

export async function quitarDelEquipo(usuarioId: string): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("quitar_del_equipo", { p_usuario: usuarioId });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo");
  return { ok: "Ya no es parte del equipo (su historial queda)" };
}

// Alta o edición de un rol: nombre, descripción, tope de descuento y permisos tildados
export async function guardarRol(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await crearCliente();
  const id = Number(f.get("id")) || null;
  const tope = String(f.get("descuento_max_pct") ?? "").trim();
  const fila = {
    nombre: String(f.get("nombre") ?? "").trim(),
    descripcion: String(f.get("descripcion") ?? "").trim() || null,
    permisos: f.getAll("permisos").map(String),
    descuento_max_pct: tope === "" ? null : Number(tope),
  };
  if (!fila.nombre) return { error: "Poné un nombre al rol" };
  const { error } = id ? await supabase.from("roles").update(fila).eq("id", id) : await supabase.from("roles").insert(fila);
  if (error) return { error: error.code === "23505" ? "Ya hay un rol con ese nombre" : error.message };
  revalidatePath("/admin/equipo");
  return { ok: id ? "Rol guardado" : "Rol creado" };
}

export async function borrarRol(id: number): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: error.code === "23503" ? "Hay personas con ese rol: cambiales el rol antes de borrarlo" : error.message };
  revalidatePath("/admin/equipo");
  return { ok: "Rol borrado" };
}

// La caja con la que cobra cada persona (null = la principal)
export async function asignarCajaPersona(usuario: string, caja: number | null): Promise<Estado> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("persona_asignar_caja", { p_usuario: usuario, p_caja: caja as unknown as number });
  if (error) return { error: error.message };
  revalidatePath("/admin/equipo");
  return { ok: "Caja asignada" };
}
