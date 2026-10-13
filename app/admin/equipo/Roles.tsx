"use client";
// Roles: cada uno es un conjunto de permisos tildados y un tope de descuento.
// El Administrador tiene todos los permisos siempre (la base no deja cambiarlo).
import { useActionState, useState, useTransition } from "react";
import { ChevronDown, CircleCheck, Eye, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { efectivos, puede } from "@/lib/permisos";
import { GRUPOS } from "@/lib/menu";
import { borrarRol, guardarRol, type Estado } from "./acciones";

type Rol = { id: number; nombre: string; descripcion: string | null; todos: boolean; permisos: string[]; descuento_max_pct: number | null };
type Permiso = { codigo: string; grupo: string; nombre: string; descripcion: string | null; padre: string | null };


function Mensaje({ e }: { e: Estado }) {
  if (e.error) return <p className="text-sm text-error">{e.error}</p>;
  if (e.ok) return <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {e.ok}</p>;
  return null;
}

function FormRol({ rol, permisos, alGuardar }: { rol?: Rol; permisos: Permiso[]; alGuardar?: () => void }) {
  const [estado, accion, cargando] = useActionState(async (prev: Estado, f: FormData) => {
    const r = await guardarRol(prev, f);
    if (r.ok) alGuardar?.();
    return r;
  }, {});
  const grupos = [...new Set(permisos.map((p) => p.grupo))];
  const admin = rol?.todos ?? false;
  const [sel, setSel] = useState<Set<string>>(new Set(rol?.permisos ?? []));
  const alternar = (c: string) => setSel((a) => { const n = new Set(a); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const [verMenu, setVerMenu] = useState(false);
  const efectivosSel = efectivos({ todos: admin, permisos: [...sel] }, permisos);

  return (
    <form action={accion} className="space-y-4">
      {rol && <input type="hidden" name="id" value={rol.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <div><label className="etiqueta">Nombre</label><input name="nombre" required defaultValue={rol?.nombre} placeholder="Cajero de la tarde" className="campo" /></div>
        <div><label className="etiqueta">Tope de descuento (%)</label>
          <input name="descuento_max_pct" type="number" min={0} max={100} step="0.5" defaultValue={rol?.descuento_max_pct ?? ""} placeholder="sin tope" disabled={admin} className="campo disabled:bg-gray-50" /></div>
      </div>
      <div><label className="etiqueta">Descripción</label><input name="descripcion" defaultValue={rol?.descripcion ?? ""} placeholder="Para qué es este rol" className="campo" /></div>
      {admin ? (
        <p className="flex items-center gap-2 rounded-lg bg-marca-suave px-3 py-2 text-sm text-marca"><ShieldCheck size={16} /> Tiene todos los permisos, incluidos los que se agreguen en el futuro.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {grupos.map((g) => (
            <fieldset key={g} className="space-y-1.5">
              <legend className="etiqueta">{g}</legend>
              {permisos.filter((p) => p.grupo === g && !p.padre).flatMap((p) => [p, ...permisos.filter((h) => h.padre === p.codigo)]).map((p) => {
                const hijo = !!p.padre, incluido = hijo && sel.has(p.padre!);
                return (
                  <label key={p.codigo} className={`flex gap-2 text-sm ${hijo ? "ml-6" : ""} ${incluido ? "opacity-60" : ""}`}>
                    <input type="checkbox" name="permisos" value={p.codigo} checked={sel.has(p.codigo) || incluido} disabled={incluido} onChange={() => alternar(p.codigo)} className="mt-0.5" />
                    <span><span className="font-medium">{p.nombre}</span>{incluido && <span className="ml-1 text-xs text-texto-2">(incluido)</span>}{p.descripcion && <span className="block text-xs text-texto-2">{p.descripcion}</span>}</span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
      )}
      <Mensaje e={estado} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="boton" disabled={cargando}>{rol ? "Guardar rol" : "Crear rol"}</button>
        <button type="button" onClick={() => setVerMenu(!verMenu)} className="boton-sec" aria-expanded={verMenu}><Eye size={16} /> {verMenu ? "Ocultar" : "¿Qué ve este rol?"}</button>
      </div>
      {verMenu && (
        <div className="space-y-2 rounded-lg bg-gray-50 p-3 text-sm">
          <p className="font-semibold">Con estos permisos, el menú muestra:</p>
          {GRUPOS.map((g) => ({ ...g, items: g.items.filter((i) => !i.permisos.length || puede(efectivosSel, ...i.permisos)) })).filter((g) => g.items.length).map((g) => (
            <p key={g.titulo ?? "inicio"}><span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{g.titulo ?? "Base"}</span><br />{g.items.map((i) => i.texto).join(" · ")}</p>
          ))}
          <p className="text-xs text-texto-2">Es lo que el rol puede abrir; los módulos apagados en este local tampoco se ven. Lo que muestra cada pantalla depende además de sus permisos finos (por ejemplo, costos).</p>
        </div>
      )}
    </form>
  );
}

export default function Roles({ roles, permisos, usados }: { roles: Rol[]; permisos: Permiso[]; usados: number[] }) {
  const [abierto, setAbierto] = useState<number | "nuevo" | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [ocupado, empezar] = useTransition();
  const cuenta = (r: Rol) => (r.todos ? "todos los permisos" : `${r.permisos.length} permiso${r.permisos.length === 1 ? "" : "s"}`);

  return (
    <section className="tarjeta space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Roles <span className="text-sm font-normal text-texto-2">({roles.length})</span></h2>
        <button type="button" onClick={() => setAbierto(abierto === "nuevo" ? null : "nuevo")} className="boton-sec py-2"><Plus size={16} /> Nuevo rol</button>
      </div>
      {abierto === "nuevo" && <div className="rounded-xl border border-borde p-4"><FormRol permisos={permisos} alGuardar={() => setAbierto(null)} /></div>}
      <ul className="divide-y divide-gray-100">
        {roles.map((r) => (
          <li key={r.id} className="py-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAbierto(abierto === r.id ? null : r.id)} aria-expanded={abierto === r.id}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
                <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${abierto === r.id ? "rotate-180" : ""}`} />
                <span className="min-w-0">
                  <span className="font-semibold">{r.nombre}</span>
                  <span className="ml-2 text-xs text-texto-2">{cuenta(r)}{r.descuento_max_pct !== null ? ` · descuento hasta ${r.descuento_max_pct} %` : ""}</span>
                  {r.descripcion && <span className="block truncate text-xs text-texto-2">{r.descripcion}</span>}
                </span>
              </button>
              {!r.todos && !usados.includes(r.id) && (
                <button type="button" disabled={ocupado} aria-label={`Borrar el rol ${r.nombre}`} title="Borrar rol (nadie lo usa)"
                  onClick={() => confirm(`¿Borrar el rol ${r.nombre}?`) && empezar(async () => setEstado(await borrarRol(r.id)))}
                  className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-error"><Trash2 size={16} /></button>
              )}
            </div>
            {abierto === r.id && <div className="mt-2 rounded-xl border border-borde p-4"><FormRol rol={r} permisos={permisos} /></div>}
          </li>
        ))}
      </ul>
      <Mensaje e={estado} />
    </section>
  );
}
