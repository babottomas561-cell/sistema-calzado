"use client";
// Una casilla por sección: tildada = se usa y aparece en el menú del equipo. Lo de arriba (ventas, productos, stock…) es la base y no se apaga.
import { useActionState } from "react";
import { CircleCheck, Save } from "lucide-react";
import { guardarModulos } from "./acciones";

export type GrupoModulos = { titulo: string; items: { href: string; texto: string; fijo: boolean; encendido: boolean }[] };

export default function Modulos({ grupos }: { grupos: GrupoModulos[] }) {
  const [estado, accion, cargando] = useActionState(guardarModulos, {});
  return (
    <form action={accion} className="space-y-5">
      {grupos.map((g) => (
        <fieldset key={g.titulo} className="tarjeta space-y-1">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{g.titulo}</legend>
          {g.items.map((i) => (
            <label key={i.href} className={`flex items-center gap-3 rounded-lg px-2 py-2.5 ${i.fijo ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
              <input type="checkbox" name="encendido" value={i.href} defaultChecked={i.encendido || i.fijo} disabled={i.fijo} className="h-5 w-5 accent-[var(--color-marca)]" />
              <span className="flex-1 font-medium">{i.texto}</span>
              {i.fijo && <span className="text-xs text-texto-2">siempre activo</span>}
            </label>
          ))}
        </fieldset>
      ))}
      {estado.error && <p role="alert" className="text-sm font-medium text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className="boton" disabled={cargando}><Save size={16} /> {cargando ? "Guardando…" : "Guardar"}</button>
    </form>
  );
}
