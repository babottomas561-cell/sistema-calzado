"use client";
// Un interruptor por cosa que el local puede usar. Al apagar una se apagan las que dependen de ella; al prender una se prenden las que necesita (la base lo vuelve a controlar).
// Una integración encendida muestra el enlace a su configuración.
import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Settings, Save } from "lucide-react";
import { guardarModulos, type Estado } from "../equipo/modulos/acciones";

export type Modulo = { clave: string; nombre: string; fijo: boolean; depende: string[]; activo: boolean };
type Fila = { clave: string; descripcion: string; configurar?: string; modulo: Modulo };
export type GrupoParametrizacion = { titulo: string; parametros: Fila[] };

export default function Parametros({ grupos }: { grupos: GrupoParametrizacion[] }) {
  const todos = grupos.flatMap((g) => g.parametros.map((p) => p.modulo));
  const [estado, setEstado] = useState<Estado>({});
  const [cargando, empezar] = useTransition();
  const [encendidos, setEncendidos] = useState(() => new Set(todos.filter((m) => m.activo || m.fijo).map((m) => m.clave)));
  const nombre = (c: string) => todos.find((m) => m.clave === c)?.nombre ?? c;

  const alternar = (m: Modulo) => {
    const siguiente = new Set(encendidos);
    if (siguiente.has(m.clave)) {
      const cola = [m.clave];
      while (cola.length) { const c = cola.pop()!; siguiente.delete(c); todos.filter((x) => x.depende.includes(c) && siguiente.has(x.clave)).forEach((x) => cola.push(x.clave)); }
    } else {
      const cola = [m.clave];
      while (cola.length) { const c = cola.pop()!; siguiente.add(c); (todos.find((x) => x.clave === c)?.depende ?? []).filter((d) => !siguiente.has(d)).forEach((d) => cola.push(d)); }
    }
    setEncendidos(siguiente);
  };

  // Se envía lo tildado desde el estado (con un <form action> React limpia las casillas al terminar y quedarían vacías)
  const guardar = () => empezar(async () => {
    const f = new FormData();
    encendidos.forEach((c) => f.append("encendido", c));
    setEstado(await guardarModulos({}, f));
  });

  return (
    <div className="space-y-5">
      {grupos.map((g) => (
        <fieldset key={g.titulo} className="tarjeta space-y-1">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">{g.titulo}</legend>
          {g.parametros.map(({ modulo: m, descripcion, configurar }) => {
            const on = encendidos.has(m.clave);
            return (
              <div key={m.clave} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
                <input id={`p-${m.clave}`} type="checkbox" checked={on} onChange={() => alternar(m)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-marca)]" />
                <label htmlFor={`p-${m.clave}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="font-medium">{m.nombre}</span>
                  {descripcion && <span className="block text-sm text-texto-2">{descripcion}</span>}
                  {m.depende.length > 0 && <span className="block text-xs text-texto-2">Necesita: {m.depende.map(nombre).join(", ")}</span>}
                </label>
                {on && configurar && <Link href={configurar} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-marca"><Settings size={14} strokeWidth={1.8} /> Configurar</Link>}
              </div>
            );
          })}
        </fieldset>
      ))}
      {estado.error && <p role="alert" className="text-sm font-medium text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm font-medium text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button type="button" onClick={guardar} className="boton" disabled={cargando}><Save size={16} /> {cargando ? "Guardando…" : "Guardar"}</button>
      <p className="text-xs text-texto-2">Apagar una integración la oculta y corta su pantalla. Lo que ya está conectado sigue funcionando hasta que lo desconectes desde su configuración.</p>
    </div>
  );
}
