"use client";
// ABM de proveedores: listado y ficha clara, con alta y edición separadas.
import { useActionState, useState } from "react";
import { guardarContacto } from "@/lib/contactos";
import { CircleCheck, Mail, NotebookText, Pencil, Phone, Plus, Save, Search, Truck, X } from "lucide-react";

type Contacto = { id: number; codigo?: number; nombre: string; telefono: string | null; email: string | null; notas: string | null };

function Formulario({ tabla, c, alCancelar, alGuardar }: { tabla: string; c?: Contacto; alCancelar: () => void; alGuardar?: () => void }) {
  const [estado, accion, cargando] = useActionState(async (previo: { error?: string; ok?: string }, formulario: FormData) => {
    const resultado = await guardarContacto(previo, formulario);
    if (resultado.ok) alGuardar?.();
    return resultado;
  }, {});
  return (
    <form action={accion} className="tarjeta space-y-4">
      <input type="hidden" name="tabla" value={tabla} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="border-b border-borde pb-3">
        <h2 className="font-semibold">{c ? "Editar datos del proveedor" : "Nuevo proveedor"}</h2>
        <p className="mt-1 text-sm text-texto-2">{c ? "Modificá los campos necesarios y guardá los cambios." : "Cargá sus datos de contacto. Después podrás asociarle artículos y precios."}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="etiqueta">Nombre *</label><input name="nombre" required defaultValue={c?.nombre} className="campo" autoFocus /></div>
        <div><label className="etiqueta">Teléfono</label><input name="telefono" defaultValue={c?.telefono ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Email</label><input name="email" type="email" defaultValue={c?.email ?? ""} className="campo" /></div>
        <div className="sm:col-span-2"><label className="etiqueta">Notas internas</label><textarea name="notas" rows={3} defaultValue={c?.notas ?? ""} className="campo" placeholder="Condiciones, días de reparto, contacto alternativo…" /></div>
      </div>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-borde pt-4">
        <button type="button" onClick={alCancelar} className="boton-sec" disabled={cargando}><X size={16} /> Cancelar</button>
        <button className="boton" disabled={cargando}><Save size={16} />{cargando ? "Guardando…" : c ? "Guardar cambios" : "Crear proveedor"}</button>
      </div>
    </form>
  );
}

export default function Contactos({ tabla, titulo, lista }: { tabla: "clientes" | "proveedores"; titulo: string; lista: Contacto[] }) {
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  const [editando, setEditando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const seleccionado = lista.find((contacto) => contacto.id === seleccionadoId) ?? null;
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const filtrados = texto ? lista.filter((contacto) => [contacto.nombre, contacto.codigo, contacto.telefono, contacto.email].some((valor) => String(valor ?? "").toLocaleLowerCase("es").includes(texto))) : lista;

  const abrirFicha = (id: number) => {
    setSeleccionadoId(id);
    setEditando(false);
    setCreando(false);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{titulo}</h1><p className="mt-1 text-sm text-texto-2">Consultá su ficha o cargá uno nuevo.</p></div>
        <button type="button" onClick={() => { setCreando(true); setEditando(false); setSeleccionadoId(null); }} className="boton"><Plus size={16} /> Nuevo proveedor</button>
      </div>

      {creando && <Formulario tabla={tabla} alCancelar={() => setCreando(false)} alGuardar={() => setCreando(false)} />}

      {seleccionado && (editando ? (
        <Formulario tabla={tabla} c={seleccionado} alCancelar={() => setEditando(false)} alGuardar={() => setEditando(false)} />
      ) : (
        <article className="tarjeta scroll-mt-24 space-y-4 border-marca/30" aria-label={`Ficha de ${seleccionado.nombre}`}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-marca-suave text-marca"><Truck size={20} /></span>
              <div className="min-w-0"><p className="font-mono text-xs text-texto-2">Proveedor {seleccionado.codigo}</p><h2 className="truncate text-xl font-bold">{seleccionado.nombre}</h2></div>
            </div>
            <div className="flex gap-2"><button type="button" onClick={() => setSeleccionadoId(null)} className="boton-sec py-2"><X size={16} /> Cerrar ficha</button><button type="button" onClick={() => setEditando(true)} className="boton py-2"><Pencil size={16} /> Editar datos</button></div>
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div><dt className="etiqueta">Teléfono</dt><dd className="flex items-center gap-2"><Phone size={15} className="text-texto-2" />{seleccionado.telefono || "—"}</dd></div>
            <div><dt className="etiqueta">Email</dt><dd className="flex min-w-0 items-center gap-2"><Mail size={15} className="shrink-0 text-texto-2" /><span className="truncate">{seleccionado.email || "—"}</span></dd></div>
            <div className="sm:col-span-2"><dt className="etiqueta">Notas internas</dt><dd className="flex items-start gap-2 whitespace-pre-wrap text-texto-2"><NotebookText size={15} className="mt-0.5 shrink-0" />{seleccionado.notas || "Sin notas."}</dd></div>
          </dl>
        </article>
      ))}

      <div className="relative max-w-xl"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-gray-400" /><input value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar por código, nombre, teléfono o email…" className="campo pl-10" /></div>

      <div className="grid gap-2 md:hidden">
        {filtrados.map((contacto) => <button type="button" key={contacto.id} onClick={() => abrirFicha(contacto.id)} className={`tarjeta flex items-center justify-between gap-3 text-left ${seleccionadoId === contacto.id ? "border-marca bg-marca-suave/40" : ""}`}>
          <span className="min-w-0"><span className="block truncate font-semibold">{contacto.nombre}</span><span className="block truncate text-xs text-texto-2">{contacto.telefono || contacto.email || `Código ${contacto.codigo}`}</span></span><span className="shrink-0 text-sm font-semibold text-marca">Ver ficha</span>
        </button>)}
      </div>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Proveedor</th><th>Teléfono</th><th>Email</th><th>Notas</th><th></th></tr></thead>
          <tbody>
            {filtrados.map((contacto) => <tr key={contacto.id} className={seleccionadoId === contacto.id ? "bg-marca-suave/40" : ""}>
              <td className="font-mono text-xs">{contacto.codigo}</td><td className="font-semibold">{contacto.nombre}</td><td>{contacto.telefono ?? "—"}</td><td>{contacto.email ?? "—"}</td><td className="max-w-xs truncate text-texto-2">{contacto.notas ?? ""}</td>
              <td className="text-right"><button type="button" onClick={() => abrirFicha(contacto.id)} className="font-semibold text-marca hover:underline">Ver ficha</button></td>
            </tr>)}
            {filtrados.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-texto-2">{lista.length ? "No encontramos proveedores con esa búsqueda." : "Todavía no hay proveedores."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
