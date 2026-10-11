"use client";
// Historial de ajustes de precios: qué se hizo, quién y cuándo, y el botón para deshacer.
import { useState, useTransition } from "react";
import { CircleCheck, History, Undo2 } from "lucide-react";
import { fechaHora } from "@/lib/formato";
import { deshacer } from "./acciones";

export type Ajuste = { id: number; fecha: string; que: string; descripcion: string | null; cantidad: number; deshecho_en: string | null;
  quien: { nombre: string | null } | null };

export default function Historial({ ajustes }: { ajustes: Ajuste[] }) {
  const [mensaje, setMensaje] = useState<{ error?: string; ok?: string }>({});
  const [ocupado, empezar] = useTransition();
  return (
    <section className="tarjeta space-y-3">
      <h2 className="flex items-center gap-2 font-semibold"><History size={17} /> Últimos ajustes</h2>
      {ajustes.length === 0 ? <p className="text-sm text-texto-2">Todavía no se hizo ningún ajuste.</p> : (
        <ul className={`divide-y divide-gray-100 ${ocupado ? "opacity-60" : ""}`}>
          {ajustes.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <div className={`font-medium ${a.deshecho_en ? "text-texto-2 line-through" : ""}`}>{a.descripcion ?? `Precio de ${a.que}`}</div>
                <div className="text-xs text-texto-2">{fechaHora(a.fecha)} · {a.cantidad} artículo{a.cantidad === 1 ? "" : "s"}{a.quien?.nombre ? ` · ${a.quien.nombre}` : ""}{a.deshecho_en ? " · deshecho" : ""}</div>
              </div>
              {!a.deshecho_en && (
                <button type="button" disabled={ocupado} className="boton-sec shrink-0 px-3 py-1.5"
                  onClick={() => confirm("¿Volver estos precios a como estaban antes del ajuste? Los que se cambiaron después no se tocan.") &&
                    empezar(async () => setMensaje(await deshacer(a.id)))}>
                  <Undo2 size={15} /> Deshacer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {mensaje.error && <p className="text-sm text-error">{mensaje.error}</p>}
      {mensaje.ok && <p className="flex items-center gap-1.5 text-sm text-ok"><CircleCheck size={16} /> {mensaje.ok}</p>}
    </section>
  );
}
