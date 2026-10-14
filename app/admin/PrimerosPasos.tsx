// Primeros pasos: qué falta para dejar el local listo, con su avance. Solo muestra lo que esta persona puede hacer y desaparece cuando está todo.
// Lo calcula la base (primeros_pasos): lo cargado, y lo que se encendió en Parametrización y falta configurar.
import Link from "next/link";
import { CircleCheck, Circle, ChevronRight } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";

type Paso = { clave: string; titulo: string; detalle: string; ruta: string; listo: boolean; opcional: boolean; puede: boolean };

export default async function PrimerosPasos() {
  const supabase = await crearCliente();
  const { data } = await supabase.rpc("primeros_pasos");
  const pasos = ((data as unknown as Paso[] | null) ?? []).filter((p) => p.puede);
  const obligatorios = pasos.filter((p) => !p.opcional);
  const hechos = obligatorios.filter((p) => p.listo).length;
  if (hechos === obligatorios.length) return null;   // solo se muestra mientras falte algún paso (los opcionales no molestan)
  return (
    <section className="tarjeta space-y-3" aria-label="Primeros pasos">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">Primeros pasos</h2>
        <span className="text-xs text-texto-2">{hechos} de {obligatorios.length}</span>
      </div>
      <div className="h-1.5 rounded bg-gray-100" role="progressbar" aria-valuemin={0} aria-valuemax={obligatorios.length} aria-valuenow={hechos}>
        <div className="h-1.5 rounded bg-marca transition-all" style={{ width: `${(hechos / obligatorios.length) * 100}%` }} />
      </div>
      <ul className="divide-y divide-gray-100">
        {pasos.map((p) => (
          <li key={p.clave}>
            <Link href={p.ruta} className="flex items-start gap-3 py-2.5 text-sm hover:bg-gray-50">
              {p.listo ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-ok" /> : <Circle size={18} className="mt-0.5 shrink-0 text-gray-300" />}
              <span className="min-w-0 flex-1"><span className={`font-medium ${p.listo ? "text-texto-2 line-through" : ""}`}>{p.titulo}</span>{p.opcional && !p.listo && <span className="ml-1.5 text-xs text-texto-2">(opcional)</span>}
                {!p.listo && <span className="block text-xs text-texto-2">{p.detalle}</span>}</span>
              {!p.listo && <ChevronRight size={16} className="mt-0.5 shrink-0 text-texto-2" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
