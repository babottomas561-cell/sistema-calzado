// Equipo: las personas del equipo con su rol, y los roles con sus permisos.
import Link from "next/link";
import { LayoutGrid, ScrollText, UserPlus } from "lucide-react";
import { exigir } from "@/lib/exigir";
import Personas from "./Personas";
import Roles from "./Roles";
import Matriz from "./Matriz";

export default async function Equipo() {
  const { supabase, user } = await exigir("equipo.administrar", "equipo.personas", "equipo.roles", "equipo.modulos", "equipo.cuentas");
  const [{ data: personas }, { data: roles }, { data: permisos }, { data: cajasPersonas }, { data: cajas }] = await Promise.all([
    supabase.rpc("equipo"),
    supabase.from("roles").select("id, nombre, descripcion, todos, permisos, descuento_max_pct, activo").order("todos", { ascending: false }).order("nombre"),
    supabase.from("permisos").select("codigo, grupo, nombre, descripcion, padre").order("orden"),
    supabase.rpc("cajas_de_personas"),
    supabase.from("cajas").select("id, nombre, sucursales(nombre)").eq("activa", true).order("id"),
  ]);
  const cajaDe = new Map((cajasPersonas ?? []).map((c) => [c.usuario_id, c.caja_id]));
  const listaRoles = (roles ?? []).map((r) => ({ ...r, descuento_max_pct: r.descuento_max_pct === null ? null : Number(r.descuento_max_pct) }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-texto-2">Quién usa el panel y qué puede hacer cada uno. Los permisos los controla la base: si un rol no puede ver costos, no los ve en ninguna pantalla.</p>
        </div>
        <Link href="/admin/equipo/bitacora" className="boton-sec"><ScrollText size={16} strokeWidth={1.8} /> Bitácora</Link>
        <Link href="/admin/parametrizacion" className="boton-sec"><LayoutGrid size={16} strokeWidth={1.8} /> Parametrización</Link>
        <Link href="/admin/equipo/cuentas" className="boton-sec"><UserPlus size={16} strokeWidth={1.8} /> Cuentas e invitaciones</Link>
      </div>
      <Personas personas={(personas ?? []).map((p) => ({ ...p, rol_id: Number(p.rol_id), caja_id: cajaDe.get(p.usuario_id) ?? null }))} roles={listaRoles} yo={user!.id}
        cajas={(cajas ?? []).map((c) => ({ id: c.id, nombre: c.nombre, sucursal: (c.sucursales as { nombre?: string } | null)?.nombre ?? "" }))} />
      <Matriz roles={listaRoles.filter((r) => r.activo)} permisos={permisos ?? []} />
      <Roles roles={listaRoles} permisos={permisos ?? []} usados={[...new Set((personas ?? []).map((p) => Number(p.rol_id)))]} />
    </div>
  );
}
