// Equipo: las personas del equipo con su rol, y los roles con sus permisos.
import Link from "next/link";
import { LayoutGrid, ScrollText, UserPlus } from "lucide-react";
import { exigir } from "@/lib/exigir";
import Personas from "./Personas";
import Roles from "./Roles";
import Matriz from "./Matriz";

export default async function Equipo() {
  const { supabase, user } = await exigir("equipo.administrar", "equipo.personas", "equipo.roles", "equipo.modulos", "equipo.cuentas");
  const [{ data: personas }, { data: roles }, { data: permisos }, { data: sucursales }, { data: puntosVenta }, { data: tienda }] = await Promise.all([
    supabase.rpc("equipo"),
    supabase.from("roles").select("id, nombre, descripcion, todos, permisos, descuento_max_pct, activo").order("todos", { ascending: false }).order("nombre"),
    supabase.from("permisos").select("codigo, grupo, nombre, descripcion, padre").order("orden"),
    supabase.from("sucursales").select("id, nombre, activa").order("id"),
    supabase.from("puntos_venta").select("id, sucursal_id, nombre, numero, activo").order("numero"),
    supabase.from("configuracion_tienda").select("multisucursal_activa").single(),
  ]);
  const listaRoles = (roles ?? []).map((r) => ({ ...r, descuento_max_pct: r.descuento_max_pct === null ? null : Number(r.descuento_max_pct) }));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-texto-2">Quién usa el panel y qué puede hacer cada uno. Los permisos los controla la base: si un rol no puede ver costos, no los ve en ninguna pantalla.</p>
        </div>
        <Link href="/admin/equipo/bitacora" className="boton-sec"><ScrollText size={16} strokeWidth={1.8} /> Bitácora</Link>
        <Link href="/admin/equipo/modulos" className="boton-sec"><LayoutGrid size={16} strokeWidth={1.8} /> Módulos del sistema</Link>
        <Link href="/admin/equipo/cuentas" className="boton-sec"><UserPlus size={16} strokeWidth={1.8} /> Cuentas e invitaciones</Link>
      </div>
      <Personas
        personas={(personas ?? []).map((p) => ({
          ...p,
          rol_id: Number(p.rol_id),
          sucursal_id: p.sucursal_id ?? null,
          sucursal: p.sucursal ?? null,
          punto_venta_id: p.punto_venta_id ?? null,
          punto_venta: p.punto_venta ?? null,
        }))}
        roles={listaRoles}
        yo={user!.id}
        sucursales={sucursales ?? []}
        puntosVenta={puntosVenta ?? []}
        multisucursalActiva={Boolean(tienda?.multisucursal_activa)}
      />
      <Matriz roles={listaRoles.filter((r) => r.activo)} permisos={permisos ?? []} />
      <Roles roles={listaRoles} permisos={permisos ?? []} usados={[...new Set((personas ?? []).map((p) => Number(p.rol_id)))]} />
    </div>
  );
}
