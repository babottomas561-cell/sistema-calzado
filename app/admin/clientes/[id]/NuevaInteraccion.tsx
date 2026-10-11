"use client";
import { useActionState, useRef } from "react";
import { nuevaInteraccion } from "../acciones";

export default function NuevaInteraccion({ clienteId }: { clienteId: number }) {
  const form = useRef<HTMLFormElement>(null);
  const [estado, accion, cargando] = useActionState(async (prev: { error?: string; ok?: string }, f: FormData) => {
    const r = await nuevaInteraccion(prev, f);
    if (r.ok) form.current?.reset();
    return r;
  }, {});
  return (
    <form ref={form} action={accion} className="space-y-2 rounded-lg bg-gray-50 p-3">
      <input type="hidden" name="cliente_id" value={clienteId} />
      <div className="grid grid-cols-2 gap-2">
        <select name="tipo" className="campo">{["Consulta", "Seguimiento", "Reclamo", "Promoción", "Nota"].map((t) => <option key={t}>{t}</option>)}</select>
        <select name="canal" className="campo"><option value="">Canal…</option>{["WhatsApp", "Instagram", "Local", "Teléfono", "Email", "Web"].map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      <textarea name="detalle" required rows={2} placeholder="¿Qué pasó? Ej.: preguntó por la Running en 44" className="campo" />
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input name="proxima_accion" placeholder="Próxima acción (opcional): avisarle cuando entre" className="campo" />
        <input name="proxima_fecha" type="date" className="campo" />
      </div>
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
      <button className="boton-sec py-1.5" disabled={cargando}>Registrar</button>
    </form>
  );
}
