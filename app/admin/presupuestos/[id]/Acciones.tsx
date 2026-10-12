"use client";
import { useActionState } from "react";
import { ShoppingCart, Ban } from "lucide-react";
import { pesos } from "@/lib/formato";
import { textoMedio, type MedioPago } from "@/lib/medios";
import { anularPresupuesto, convertirPresupuesto } from "../acciones";

// Convertir en venta: se cobra con el medio presupuestado (u otro: ahí rige el % de ese medio hoy)
export default function Acciones({ id, medios, medioPresupuestado, total }: {
  id: number; medios: MedioPago[]; medioPresupuestado: number | null; total: number;
}) {
  const [conv, convertir, convirtiendo] = useActionState(convertirPresupuesto, {});
  const [anul, anular, anulando] = useActionState(anularPresupuesto, {});
  return (
    <section className="tarjeta space-y-3 print:hidden">
      <h2 className="font-semibold">Confirmar el presupuesto</h2>
      <form action={convertir} className="space-y-2">
        <input type="hidden" name="id" value={id} />
        <label className="etiqueta">Se cobra con</label>
        <select name="medio" defaultValue={medioPresupuestado ?? ""} className="campo" required>
          {medioPresupuestado === null && <option value="">Elegí…</option>}
          {medios.map((m) => <option key={m.id} value={m.id}>{textoMedio(m)}</option>)}
        </select>
        <p className="text-xs text-texto-2">Con el medio presupuestado se cobra {pesos(total)}. Con otro, cambia el % de ese medio. Al confirmar se descuenta el stock.</p>
        {conv.error && <p className="text-sm text-error">{conv.error}</p>}
        <button className="boton w-full" disabled={convirtiendo}><ShoppingCart size={16} /> {convirtiendo ? "Registrando…" : "Convertir en venta"}</button>
      </form>
      <form action={anular} className="border-t border-borde pt-3">
        <input type="hidden" name="id" value={id} />
        {anul.error && <p className="mb-2 text-sm text-error">{anul.error}</p>}
        <button className="boton-sec w-full" disabled={anulando}><Ban size={16} /> Anular presupuesto</button>
      </form>
    </section>
  );
}
