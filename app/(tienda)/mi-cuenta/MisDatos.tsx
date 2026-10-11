"use client";
import { useActionState } from "react";
import { guardarMisDatos } from "./acciones";
import { CircleCheck } from "lucide-react";

type F = { nombre: string; documento: string | null; telefono: string | null; email: string | null; direccion: string | null;
  localidad: string | null; fecha_nacimiento: string | null; acepta_promos: boolean };

export default function MisDatos({ ficha }: { ficha: F }) {
  const [estado, accion, cargando] = useActionState(guardarMisDatos, {});
  return (
    <form action={accion} className="tarjeta h-fit space-y-3">
      <h2 className="font-semibold">Mis datos</h2>
      <div><label className="etiqueta">Nombre</label><input name="nombre" required defaultValue={ficha.nombre} className="campo" /></div>
      <div className="text-sm text-texto-2">{ficha.email}</div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="etiqueta">Teléfono</label><input name="telefono" defaultValue={ficha.telefono ?? ""} className="campo" /></div>
        <div><label className="etiqueta">DNI</label><input name="documento" defaultValue={ficha.documento ?? ""} className="campo" /></div>
      </div>
      <div><label className="etiqueta">Dirección</label><input name="direccion" defaultValue={ficha.direccion ?? ""} className="campo" /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="etiqueta">Localidad</label><input name="localidad" defaultValue={ficha.localidad ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Cumpleaños</label><input name="fecha_nacimiento" type="date" defaultValue={ficha.fecha_nacimiento ?? ""} className="campo" /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="acepta_promos" defaultChecked={ficha.acepta_promos} /> Quiero recibir promociones</label>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      {estado.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {estado.ok}</p>}
      <button className="boton-sec w-full" disabled={cargando}>Guardar</button>
    </form>
  );
}
