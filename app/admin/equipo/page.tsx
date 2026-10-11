// Equipo: las personas del equipo con su rol, y los roles con sus permisos.
import { exigir } from "@/lib/exigir";
import Personas from "./Personas";
import Roles from "./Roles";

export default async function Equipo() {
  const { supabase, user } = await exigir("equipo.administrar");
  const [{ data: personas }, { data: roles }, { data: permisos }] = await Promise.all([
    supabase.rpc("equipo"),
    supabase.from("roles").select("id, nombre, descripcion, todos, permisos, descuento_max_pct, activo").order("todos", { ascending: false }).order("nombre"),
    supabase.from("permisos").select("codigo, grupo, nombre, descripcion").order("orden"),
  ]);
  const listaRoles = (roles ?? []).map((r) => ({ ...r, descuento_max_pct: r.descuento_max_pct === null ? null : Number(r.descuento_max_pct) }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-texto-2">Quién usa el panel y qué puede hacer cada uno. Los permisos los controla la base: si un rol no puede ver costos, no los ve en ninguna pantalla.</p>
      </div>
      <Personas personas={(personas ?? []).map((p) => ({ ...p, rol_id: Number(p.rol_id) }))} roles={listaRoles} yo={user!.id} />
      <Roles roles={listaRoles} permisos={permisos ?? []} usados={[...new Set((personas ?? []).map((p) => Number(p.rol_id)))]} />
    </div>
  );
}
