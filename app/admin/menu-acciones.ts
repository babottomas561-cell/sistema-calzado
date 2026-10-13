"use server";
// Menú de cada persona del equipo: sus favoritos y lo que prefiere no ver (la base lo guarda por usuario).
import { crearCliente } from "@/lib/supabase/server";

export async function guardarMenu(favoritos: string[], ocultos: string[]): Promise<void> {
  const supabase = await crearCliente();
  const { error } = await supabase.rpc("guardar_menu_usuario", { p_favoritos: favoritos.slice(0, 40), p_ocultos: ocultos.slice(0, 80) });
  if (error) throw new Error(error.message);
}
