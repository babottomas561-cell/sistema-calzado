// Las tablas maestras que alimentan los desplegables de productos (marca, rubro, subrubro, talles, colores).
import { crearCliente } from "@/lib/supabase/server";

export async function leerMaestros() {
  const supabase = await crearCliente();
  const [m, c, s, t, co] = await Promise.all([
    supabase.from("marcas").select("id, codigo, nombre").order("nombre"),
    supabase.from("categorias").select("id, codigo, nombre").order("nombre"),
    supabase.from("subcategorias").select("id, codigo, nombre, categoria_id").order("nombre"),
    supabase.from("talles").select("id, nombre, tipo").order("orden"),
    supabase.from("colores").select("id, codigo, nombre, hex").order("nombre"),
  ]);
  return {
    maestros: { marcas: m.data ?? [], categorias: c.data ?? [], subcategorias: s.data ?? [] },
    talles: t.data ?? [],
    colores: co.data ?? [],
  };
}
