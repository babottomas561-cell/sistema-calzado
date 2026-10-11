// Todo lo que hay que hacer con clientes: próximas acciones pendientes y cumpleaños de la semana.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, fecha } from "@/lib/formato";
import { marcarHecha } from "../clientes/acciones";
import { Check } from "lucide-react";
import { exigir } from "@/lib/exigir";

export default async function Seguimientos() {
  await exigir("clientes.ver");
  const supabase = await crearCliente();
  const hoy = diaArgentina();
  const [{ data: pendientes }, { data: clientes }] = await Promise.all([
    supabase.from("interacciones").select("id, cliente_id, proxima_accion, proxima_fecha, detalle, clientes(nombre, telefono)")
      .eq("hecha", false).not("proxima_accion", "is", null).order("proxima_fecha", { nullsFirst: false }),
    supabase.from("clientes").select("id, nombre, fecha_nacimiento, acepta_promos").not("fecha_nacimiento", "is", null),
  ]);

  // Cumpleaños de los próximos 7 días (mes-día)
  const proximos = Array.from({ length: 7 }, (_, i) => diaArgentina(i).slice(5, 10));
  const cumples = (clientes ?? []).filter((c) => proximos.includes(String(c.fecha_nacimiento).slice(5, 10)));

  const grupo = (p: { proxima_fecha: string | null }) => !p.proxima_fecha ? "Sin fecha" : p.proxima_fecha < hoy ? "Vencidos" : p.proxima_fecha === hoy ? "Hoy" : "Próximos";
  const grupos = ["Vencidos", "Hoy", "Próximos", "Sin fecha"];

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Seguimientos</h1>
      {cumples.length > 0 && (
        <section className="tarjeta"><h2 className="mb-2 font-semibold">🎂 Cumpleaños esta semana</h2>
          <ul className="text-sm">{cumples.map((c) => <li key={c.id}><Link href={`/admin/clientes/${c.id}`} className="text-marca">{c.nombre}</Link> · {String(c.fecha_nacimiento).slice(8, 10)}/{String(c.fecha_nacimiento).slice(5, 7)}{c.acepta_promos ? " · acepta promos" : ""}</li>)}</ul>
        </section>
      )}
      {grupos.map((g) => {
        const lista = (pendientes ?? []).filter((p) => grupo(p) === g);
        if (!lista.length) return null;
        return (
          <section key={g} className="tarjeta">
            <h2 className={`mb-2 font-semibold ${g === "Vencidos" ? "text-error" : ""}`}>{g} ({lista.length})</h2>
            <ul className="divide-y divide-gray-100 text-sm">
              {lista.map((p) => {
                const c = p.clientes as unknown as { nombre: string; telefono: string | null };
                return (
                  <li key={p.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div><Link href={`/admin/clientes/${p.cliente_id}`} className="font-semibold text-marca">{c.nombre}</Link>
                      <span className="text-texto-2">{p.proxima_fecha ? ` · ${fecha(p.proxima_fecha + "T12:00:00")}` : ""}</span>
                      <div>→ {p.proxima_accion}</div><div className="text-xs text-texto-2">{p.detalle}</div></div>
                    <form action={marcarHecha}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="cliente_id" value={p.cliente_id} />
                      <button className="boton-sec py-1.5"><Check size={15} /> Hecho</button></form>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!pendientes?.length && !cumples.length && <p className="text-texto-2">No hay seguimientos pendientes. 🎉</p>}
    </div>
  );
}
