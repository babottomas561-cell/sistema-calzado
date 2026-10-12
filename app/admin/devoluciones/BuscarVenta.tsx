// Buscar la venta para un cambio o una devolución: por el número del ticket, el cliente o su teléfono.
// Lo resuelve la base (ventas_para_cambio): sirve aunque la venta la haya hecho otro vendedor, y muestra
// solo lo necesario para reconocerla (sin montos).
import Link from "next/link";
import { ArrowLeftRight, Search, Undo2 } from "lucide-react";
import { fechaHora } from "@/lib/formato";

type Encontrada = { id: number; comprobante: string; fecha: string; cliente: string | null; productos: string | null; en_plazo: boolean };

export default function BuscarVenta({ buscar, resultados, error }: { buscar: string; resultados: Encontrada[]; error?: string }) {
  return (
    <section className="tarjeta space-y-3">
      <h2 className="font-semibold">Hacer un cambio o una devolución</h2>
      <form className="flex gap-2">
        <div className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input name="buscar" defaultValue={buscar} placeholder="N.º del ticket, cliente o teléfono" className="campo pl-9" aria-label="Buscar la venta" /></div>
        <button className="boton">Buscar</button>
      </form>
      {error && <p className="text-sm text-error">{error}</p>}
      {buscar && !error && resultados.length === 0 && <p className="text-sm text-texto-2">No encontramos ventas con «{buscar}».</p>}
      {resultados.length > 0 && <ul className="divide-y divide-gray-100">{resultados.map((r) => (
        <li key={r.id} className="space-y-2 py-3 first:pt-0">
          <div className="text-sm"><span className="font-mono font-semibold">{r.comprobante}</span> · {fechaHora(r.fecha)} · {r.cliente ?? "sin cliente"}
            {!r.en_plazo && <span className="chip ml-1.5 bg-amber-100 text-alerta">fuera de plazo</span>}
            <p className="text-texto-2">{r.productos}</p></div>
          <div className="flex gap-2">
            <Link href={`/admin/ventas/${r.id}/cambio`} className="boton-sec px-3 py-1.5"><ArrowLeftRight size={15} /> Cambio</Link>
            <Link href={`/admin/ventas/${r.id}/devolucion`} className="boton-sec px-3 py-1.5"><Undo2 size={15} /> Devolución</Link>
          </div>
        </li>
      ))}</ul>}
    </section>
  );
}
