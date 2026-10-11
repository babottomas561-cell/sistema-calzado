"use client";
// Formulario de datos del cliente (alta y edición).
import { useActionState } from "react";
import { guardarCliente } from "./acciones";
import { CircleCheck } from "lucide-react";

type C = { id?: number; nombre?: string; documento?: string | null; telefono?: string | null; email?: string | null; direccion?: string | null;
  localidad?: string | null; fecha_nacimiento?: string | null; origen?: string | null; etiquetas?: string[]; acepta_promos?: boolean; notas?: string | null };
const ORIGENES = ["Local", "Instagram", "WhatsApp", "Web", "Referido", "Otro"];

export default function FichaForm({ c = {} }: { c?: C }) {
  const [estado, accion, cargando] = useActionState(guardarCliente, {});
  return (
    <form action={accion} className="tarjeta space-y-4">
      {c.id && <input type="hidden" name="id" value={c.id} />}
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
      <button className="boton" disabled={cargando}>{c.id ? "Guardar cambios" : "Crear cliente"}</button>
    </form>
  );
}
