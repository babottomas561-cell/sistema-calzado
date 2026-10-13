"use client";
// Formulario de datos del cliente (alta y edición).
import { useActionState } from "react";
import { useState } from "react";
import { guardarCliente } from "./acciones";
import { CircleCheck, Mail, MapPin, Pencil, Phone, Save, UserRound, X } from "lucide-react";

type C = { id?: number; nombre?: string; documento?: string | null; telefono?: string | null; email?: string | null; direccion?: string | null;
  localidad?: string | null; fecha_nacimiento?: string | null; origen?: string | null; etiquetas?: string[]; acepta_promos?: boolean; notas?: string | null };
const ORIGENES = ["Local", "Instagram", "WhatsApp", "Web", "Referido", "Otro"];

const dato = (valor?: string | null) => valor?.trim() || "—";

export default function FichaForm({ c = {}, puedeEditar = true, iniciarEdicion = false }: { c?: C; puedeEditar?: boolean; iniciarEdicion?: boolean }) {
  const [editando, setEditando] = useState(!c.id || iniciarEdicion);
  const [estado, accion, cargando] = useActionState(async (anterior: { error?: string; ok?: string }, formulario: FormData) => {
    const resultado = await guardarCliente(anterior, formulario);
    if (resultado.ok && c.id) setEditando(false);
    return resultado;
  }, {});

  if (c.id && !editando) return (
    <section id="datos-cliente" className="tarjeta scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-borde pb-3">
        <div><h2 className="flex items-center gap-2 font-semibold"><UserRound size={18} /> Datos del cliente</h2>
          <p className="mt-1 text-sm text-texto-2">Información de contacto y datos internos del local.</p></div>
        {puedeEditar && <button type="button" onClick={() => setEditando(true)} className="boton-sec py-2"><Pencil size={16} /> Editar datos</button>}
      </div>
      <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
        <div><dt className="etiqueta">Nombre</dt><dd className="font-semibold">{dato(c.nombre)}</dd></div>
        <div><dt className="etiqueta">DNI / CUIT</dt><dd>{dato(c.documento)}</dd></div>
        <div><dt className="etiqueta">Teléfono</dt><dd className="flex items-center gap-2"><Phone size={15} className="text-texto-2" />{dato(c.telefono)}</dd></div>
        <div><dt className="etiqueta">Email</dt><dd className="flex min-w-0 items-center gap-2"><Mail size={15} className="shrink-0 text-texto-2" /><span className="truncate">{dato(c.email)}</span></dd></div>
        <div className="sm:col-span-2"><dt className="etiqueta">Dirección</dt><dd className="flex items-center gap-2"><MapPin size={15} className="shrink-0 text-texto-2" />{[c.direccion, c.localidad].filter(Boolean).join(", ") || "—"}</dd></div>
        <div><dt className="etiqueta">Cumpleaños</dt><dd>{dato(c.fecha_nacimiento)}</dd></div>
        <div><dt className="etiqueta">Origen</dt><dd>{dato(c.origen)}</dd></div>
        <div className="sm:col-span-2"><dt className="etiqueta">Etiquetas</dt><dd className="flex flex-wrap gap-1">{c.etiquetas?.length ? c.etiquetas.map((e) => <span key={e} className="chip bg-gray-100 text-texto-2">#{e}</span>) : "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="etiqueta">Notas internas</dt><dd className="whitespace-pre-wrap text-texto-2">{dato(c.notas)}</dd></div>
      </dl>
      <p className="text-xs text-texto-2">{c.acepta_promos ? "Acepta recibir promociones." : "No acepta recibir promociones."}</p>
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
    </section>
  );

  return (
    <form id="datos-cliente" action={accion} className="tarjeta scroll-mt-24 space-y-4">
      {c.id && <input type="hidden" name="id" value={c.id} />}
      <div className="border-b border-borde pb-3">
        <h2 className="font-semibold">{c.id ? "Editar datos del cliente" : "Datos del nuevo cliente"}</h2>
        <p className="mt-1 text-sm text-texto-2">{c.id ? "Modificá los campos necesarios y guardá los cambios." : "Completá al menos el nombre; el resto se puede agregar después."}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="etiqueta">Nombre *</label><input name="nombre" required defaultValue={c.nombre} className="campo" /></div>
        <div><label className="etiqueta">Teléfono</label><input name="telefono" defaultValue={c.telefono ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Email</label><input name="email" type="email" defaultValue={c.email ?? ""} className="campo" /></div>
        <div><label className="etiqueta">DNI / CUIT</label><input name="documento" defaultValue={c.documento ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Cumpleaños</label><input name="fecha_nacimiento" type="date" defaultValue={c.fecha_nacimiento ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Dirección</label><input name="direccion" defaultValue={c.direccion ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Localidad</label><input name="localidad" defaultValue={c.localidad ?? ""} className="campo" /></div>
        <div><label className="etiqueta">¿Cómo nos conoció?</label>
          <select name="origen" defaultValue={c.origen ?? ""} className="campo"><option value="">—</option>{ORIGENES.map((o) => <option key={o}>{o}</option>)}</select></div>
        <div><label className="etiqueta">Etiquetas</label><input name="etiquetas" defaultValue={(c.etiquetas ?? []).join(", ")} placeholder="running, mayorista, vip" className="campo" /></div>
        <div className="sm:col-span-2"><label className="etiqueta">Notas internas (el cliente no las ve)</label><textarea name="notas" rows={2} defaultValue={c.notas ?? ""} className="campo" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acepta_promos" defaultChecked={c.acepta_promos ?? true} /> Acepta recibir promociones</label>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-borde pt-4">
        {c.id && <button type="button" onClick={() => setEditando(false)} className="boton-sec" disabled={cargando}><X size={16} /> Cancelar</button>}
        <button className="boton" disabled={cargando}><Save size={16} />{cargando ? "Guardando…" : c.id ? "Guardar cambios" : "Crear cliente"}</button>
      </div>
    </form>
  );
}
