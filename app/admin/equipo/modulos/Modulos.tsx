"use client";
// Una casilla por parte del sistema: tildada = se usa y aparece en el menú. Lo fijo (ventas, productos, stock…) es la base y no se apaga.
// Al apagar una parte se apagan las que dependen de ella; al prender una se prenden de las que necesita. La base lo vuelve a controlar.
import { useActionState, useState } from "react";
import { CircleCheck, Save } from "lucide-react";
import { guardarModulos } from "./acciones";

export type Modulo = { clave: string; nombre: string; fijo: boolean; depende: string[]; activo: boolean };
export type GrupoModulos = { titulo: string; modulos: Modulo[] };

export default function Modulos({ grupos }: { grupos: GrupoModulos[] }) {
  const todos = grupos.flatMap((g) => g.modulos);
  const [estado, accion, cargando] = useActionState(guardarModulos, {});
  const [encendidos, setEncendidos] = useState(() => new Set(todos.filter((m) => m.activo || m.fijo).map((m) => m.clave)));
  const nombre = (c: string) => todos.find((m) => m.clave === c)?.nombre ?? c;

  const alternar = (m: Modulo) => {
    const siguiente = new Set(encendidos);
    if (siguiente.has(m.clave)) {
      // Apagar: también lo que depende de él (en cadena)
      const cola = [m.clave];
      while (cola.length) { const c = cola.pop()!; siguiente.delete(c); todos.filter((x) => x.depende.includes(c) && siguiente.has(x.clave)).forEach((x) => cola.push(x.clave)); }
    } else {
      // Prender: también lo que necesita (en cadena)
      const cola = [m.clave];
      while (cola.length) { const c = cola.pop()!; siguiente.add(c); (todos.find((x) => x.clave === c)?.depende ?? []).filter((d) => !siguiente.has(d)).forEach((d) => cola.push(d)); }
    }
    setEncendidos(siguiente);
  };

  return (
    <form action={accion} className="space-y-5">
      {grupos.map((g) => (
        <fieldset key={g.titulo} className="tarjeta space-y-1">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{g.titulo}</legend>
          {g.modulos.map((m) => (
            <label key={m.clave} className={`flex items-center gap-3 rounded-lg px-2 py-2.5 ${m.fijo ? "opacity-60" : "cursor-pointer hover:bg-gray-50"}`}>
              <input type="checkbox" name="encendido" value={m.clave} checked={encendidos.has(m.clave)} disabled={m.fijo} onChange={() => alternar(m)} className="h-5 w-5 accent-[var(--color-marca)]" />
              <span className="flex-1"><span className="font-medium">{m.nombre}</span>{m.depende.length > 0 && <span className="block text-xs text-texto-2">Necesita: {m.depende.map(nombre).join(", ")}</span>}</span>
              {m.fijo && <span className="text-xs text-texto-2">siempre activo</span>}
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
