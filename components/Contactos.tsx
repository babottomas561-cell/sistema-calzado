"use client";
// Pantalla de clientes o proveedores: listado, alta y edición en el lugar.
import { useActionState, useState } from "react";
import { guardarContacto } from "@/lib/contactos";
import {  } from "lucide-react";

type Contacto = { id: number; codigo?: number; nombre: string; telefono: string | null; email: string | null; notas: string | null };

function Formulario({ tabla, c, alGuardar }: { tabla: string; c?: Contacto; alGuardar?: () => void }) {
  const [estado, accion, cargando] = useActionState(async (prev: { error?: string; ok?: string }, f: FormData) => {
    const r = await guardarContacto(prev, f);
    if (r.ok && alGuardar) alGuardar();
    return r;
  }, {});
  return (
    <form action={accion} className="grid gap-2 sm:grid-cols-[2fr_1fr_1.5fr_1.5fr_auto]">
      <input type="hidden" name="tabla" value={tabla} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <input name="nombre" required defaultValue={c?.nombre} placeholder="Nombre *" className="campo" />
      <input name="telefono" defaultValue={c?.telefono ?? ""} placeholder="Teléfono" className="campo" />
      <input name="email" type="email" defaultValue={c?.email ?? ""} placeholder="Email" className="campo" />
      <input name="notas" defaultValue={c?.notas ?? ""} placeholder="Notas" className="campo" />
      <button className="boton" disabled={cargando}>{c ? "Guardar" : "Agregar"}</button>
      {(estado.error || estado.ok) && <p className={`text-sm sm:col-span-5 ${estado.error ? "text-error" : "text-ok"}`}>{estado.error ?? estado.ok}</p>}
    </form>
  );
}

export default function Contactos({ tabla, titulo, lista }: { tabla: "clientes" | "proveedores"; titulo: string; lista: Contacto[] }) {
  const [editando, setEditando] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{titulo}</h1>
      <div className="tarjeta"><h2 className="mb-3 font-semibold">Agregar</h2><Formulario key={lista.length} tabla={tabla} /></div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {lista.map((c) => editando === c.id ? (
              <tr key={c.id}><td colSpan={6}><Formulario tabla={tabla} c={c} alGuardar={() => setEditando(null)} /></td></tr>
            ) : (
              <tr key={c.id}>
                <td className="font-mono text-xs">{c.codigo}</td>
                <td className="font-semibold">{c.nombre}</td><td>{c.telefono ?? "—"}</td><td>{c.email ?? "—"}</td><td className="text-texto-2">{c.notas ?? ""}</td>
                <td className="text-right"><button onClick={() => setEditando(c.id)} className="text-sm font-semibold text-marca">Editar</button></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-texto-2">Todavía no hay {titulo.toLowerCase()}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
