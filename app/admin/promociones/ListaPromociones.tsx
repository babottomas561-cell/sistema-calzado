"use client";
// Lista de promociones con su estado, y la edición en el lugar.
import { useState, useTransition } from "react";
import { ChevronDown, CircleCheck, Pause, Play, Plus, Trash2 } from "lucide-react";
import { borrarPromocion, pausarPromocion, type Estado } from "./acciones";
import FormPromocion, { type Opcion, type Promocion } from "./FormPromocion";

type Fila = Promocion & { etiqueta: string; estado: "vigente" | "programada" | "terminada" | "pausada"; alcance: string };

const COLOR = { vigente: "bg-green-100 text-ok", programada: "bg-blue-100 text-marca", terminada: "bg-gray-100 text-texto-2", pausada: "bg-amber-100 text-alerta" };

export default function ListaPromociones({ promos, opciones }: {
  promos: Fila[]; opciones: { marcas: Opcion[]; rubros: Opcion[]; subrubros: Opcion[]; productos: Opcion[] };
}) {
  const [abierta, setAbierta] = useState<number | "nueva" | null>(promos.length ? null : "nueva");
  const [mensaje, setMensaje] = useState<Estado>({});
  const [ocupado, empezar] = useTransition();
  const accion = (fn: () => Promise<Estado>) => empezar(async () => setMensaje(await fn()));

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setAbierta(abierta === "nueva" ? null : "nueva")} className="boton"><Plus size={16} /> Nueva promoción</button>
      </div>
      {abierta === "nueva" && <section className="tarjeta"><FormPromocion {...opciones} alGuardar={() => setAbierta(null)} /></section>}
      {mensaje.error && <p className="text-sm text-error">{mensaje.error}</p>}
      {mensaje.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {mensaje.ok}</p>}

      <ul className={`space-y-2 ${ocupado ? "opacity-60" : ""}`}>
        {promos.map((p) => (
          <li key={p.id} className="tarjeta p-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-11 w-14 shrink-0 place-items-center rounded-lg bg-marca-suave text-sm font-bold text-marca">{p.etiqueta}</span>
              <button type="button" onClick={() => setAbierta(abierta === p.id ? null : p.id)} aria-expanded={abierta === p.id} className="min-w-0 flex-1 text-left">
                <span className="flex items-center gap-2"><b className="truncate">{p.nombre}</b><span className={`chip ${COLOR[p.estado]}`}>{p.estado}</span></span>
                <span className="block truncate text-xs text-texto-2">{p.alcance} · {[p.en_tienda && "tienda", p.en_mostrador && "local"].filter(Boolean).join(" y ")}</span>
              </button>
              <button type="button" disabled={ocupado} title={p.activa ? "Pausar" : "Activar"} aria-label={p.activa ? `Pausar ${p.nombre}` : `Activar ${p.nombre}`}
                onClick={() => accion(() => pausarPromocion(p.id, !p.activa))} className="grid h-9 w-9 place-items-center rounded-lg text-gray-500 hover:bg-gray-100">
                {p.activa ? <Pause size={16} /> : <Play size={16} />}</button>
              <button type="button" disabled={ocupado} title="Borrar" aria-label={`Borrar ${p.nombre}`}
                onClick={() => confirm(`¿Borrar "${p.nombre}"? Si ya se usó en ventas, conviene pausarla.`) && accion(() => borrarPromocion(p.id))}
                className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-error"><Trash2 size={16} /></button>
              <ChevronDown size={16} className={`shrink-0 text-gray-400 transition ${abierta === p.id ? "rotate-180" : ""}`} />
            </div>
            {abierta === p.id && <div className="border-t border-borde p-4"><FormPromocion promo={p} {...opciones} alGuardar={() => setAbierta(null)} /></div>}
          </li>
        ))}
        {promos.length === 0 && abierta !== "nueva" && <li className="tarjeta py-8 text-center text-sm text-texto-2">Todavía no hay promociones.</li>}
      </ul>
    </div>
  );
}
