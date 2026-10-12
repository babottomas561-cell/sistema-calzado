"use client";
// Zonas de envío: lo que paga el cliente según dónde vive. La tienda las ofrece al elegir «Envío» y el precio lo pone
// la base. Sin precio = «a coordinar» (por ejemplo, el interior).
import { useActionState, useState } from "react";
import { CircleCheck, Pencil } from "lucide-react";
import { pesos } from "@/lib/formato";
import { activarZona, guardarZona } from "../acciones";

type Zona = { id: number; nombre: string; descripcion: string | null; precio: number | null; activo: boolean };

function FormZona({ zona, alListo }: { zona?: Zona; alListo?: () => void }) {
  const [estado, accion, guardando] = useActionState(async (s: { error?: string; ok?: string }, f: FormData) => {
    const r = await guardarZona(s, f); if (r.ok) alListo?.(); return r;
  }, {});
  return (
    <form action={accion} key={estado.ok ?? "zona"} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_auto]">
      {zona && <input type="hidden" name="id" value={zona.id} />}
      <div className="space-y-2">
        <input name="nombre" defaultValue={zona?.nombre} required maxLength={60} placeholder="Zona (Centro, Yerba Buena…)" className="campo" aria-label="Nombre de la zona" />
        <input name="descripcion" defaultValue={zona?.descripcion ?? ""} maxLength={200} placeholder="Qué abarca (opcional): barrios, calles…" className="campo" aria-label="Qué abarca la zona" />
      </div>
      <div className="relative h-fit"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-2">$</span>
        <input name="precio" inputMode="decimal" defaultValue={zona?.precio ?? ""} placeholder="a coordinar" className="campo pl-7" aria-label="Precio del envío" /></div>
      <button className="boton-sec h-fit" disabled={guardando}>{guardando ? "Guardando…" : zona ? "Guardar" : "Agregar"}</button>
      {estado.error && <p className="text-sm text-error sm:col-span-3">{estado.error}</p>}
      {estado.ok && !zona && <p className="flex items-center gap-1.5 text-sm text-ok sm:col-span-3"><CircleCheck size={15} /> {estado.ok}</p>}
    </form>
  );
}

export default function ZonasEnvio({ zonas }: { zonas: Zona[] }) {
  const [editando, setEditando] = useState<number | null>(null);
  return (
    <div className="space-y-4 px-5 py-4">
      {zonas.length === 0 && <p className="text-sm text-texto-2">Todavía no hay zonas: mientras no cargues ninguna, el envío se coordina por WhatsApp.</p>}
      <ul className="divide-y divide-gray-100">{zonas.map((z) => (
        <li key={z.id} className={`py-2.5 ${z.activo ? "" : "opacity-50"}`}>
          {editando === z.id ? <FormZona zona={z} alListo={() => setEditando(null)} /> : (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0"><span className="font-medium">{z.nombre}</span>
                {z.descripcion && <span className="block text-xs text-texto-2">{z.descripcion}</span>}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">{z.precio == null ? "a coordinar" : pesos(z.precio)}</span>
                <button type="button" onClick={() => setEditando(z.id)} className="rounded p-1.5 text-texto-2 hover:bg-gray-100" aria-label={`Editar ${z.nombre}`}><Pencil size={15} strokeWidth={1.8} /></button>
                <form action={activarZona}><input type="hidden" name="id" value={z.id} /><input type="hidden" name="activo" value={z.activo ? "0" : "1"} />
                  <button className="boton-sec px-2.5 py-1 text-xs">{z.activo ? "Pausar" : "Activar"}</button></form>
              </span>
            </div>
          )}
        </li>
      ))}</ul>
      <div className="border-t border-borde pt-3"><p className="mb-2 text-sm font-semibold">Agregar zona</p><FormZona /></div>
    </div>
  );
}
