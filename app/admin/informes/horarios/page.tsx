// Cuándo se vende: ventas por día de la semana y por hora (hora argentina), con un mapa de calor. Sirve para decidir turnos de atención y cuándo
// lanzar una promoción. No lleva costos: cuenta ventas y lo cobrado.
import { Clock, Flame } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { DIAS_SEMANA, diasDe, diaYHora, leerTodo, limites, PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import SelectorPeriodo from "../SelectorPeriodo";

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default async function Horarios({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  await exigir("informes.ventas");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const rango = rangoDe(periodo, diaArgentina(), sp.desde, sp.hasta);
  const l = limites(rango);
  const supabase = await crearCliente();
  const items = await leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, venta_id, fecha, importe_neto")
    .eq("es_devolucion", false).gte("fecha", l.gte).lt("fecha", l.lt).order("id").range(a, b));

  // Una venta cuenta una vez (tiene un renglón por artículo): su fecha y lo cobrado por sus artículos
  const ventas = new Map<number, { fecha: string; total: number }>();
  for (const i of items) {
    if (!i.venta_id || !i.fecha) continue;
    const v = ventas.get(i.venta_id) ?? { fecha: i.fecha, total: 0 };
    v.total += Number(i.importe_neto ?? 0);
    ventas.set(i.venta_id, v);
  }
  const celda = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ n: 0, total: 0 })));
  for (const v of ventas.values()) { const { dia, hora } = diaYHora(v.fecha); celda[dia][hora].n += 1; celda[dia][hora].total += v.total; }

  const porDia = DIAS_SEMANA.map((nombre, d) => ({ nombre, n: celda[d].reduce((s, c) => s + c.n, 0), total: celda[d].reduce((s, c) => s + c.total, 0) }));
  const porHora = Array.from({ length: 24 }, (_, h) => ({ h, n: celda.reduce((s, f) => s + f[h].n, 0), total: celda.reduce((s, f) => s + f[h].total, 0) }));
  // Cuántas veces ocurre cada día de la semana en el período (para promediar: un período con 5 sábados y 4 lunes no es parejo)
  const ocurrencias = Array(7).fill(0) as number[];
  for (const d of diasDe(rango)) ocurrencias[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7] += 1;
  const promedioDia = porDia.map((d, i) => (ocurrencias[i] ? d.total / ocurrencias[i] : 0));

  const totalVentas = ventas.size;
  const horasConVentas = porHora.filter((x) => x.n > 0).map((x) => x.h);
  const desdeH = Math.min(8, ...(horasConVentas.length ? horasConVentas : [8])), hastaH = Math.max(21, ...(horasConVentas.length ? horasConVentas : [21]));
  const horas = Array.from({ length: hastaH - desdeH + 1 }, (_, i) => desdeH + i);
  const maxCelda = Math.max(1, ...celda.flat().map((c) => c.n));
  const mejorDia = promedioDia.indexOf(Math.max(...promedioDia)), peorDia = promedioDia.indexOf(Math.min(...promedioDia.filter((_, i) => ocurrencias[i] > 0)));
  const horaPico = porHora.reduce((a, b) => (b.n > a.n ? b : a), porHora[0]);
  // La franja de 3 horas seguidas con más ventas
  const franja = porHora.map((x) => ({ h: x.h, n: porHora[x.h].n + (porHora[x.h + 1]?.n ?? 0) + (porHora[x.h + 2]?.n ?? 0) })).reduce((a, b) => (b.n > a.n ? b : a));
  const maxDia = Math.max(1, ...promedioDia), maxHora = Math.max(1, ...porHora.map((x) => x.n));

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/horarios" periodo={periodo} rango={rango} />
      {totalVentas === 0 ? <p className="tarjeta py-10 text-center text-sm text-texto-2">No hay ventas en el período elegido.</p> : <>
        {totalVentas < 30 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">Hay pocas ventas ({totalVentas}) para sacar conclusiones: probá con un período más largo, como «Este año».</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="tarjeta"><div className="etiqueta">Mejor día</div><div className="text-xl font-bold">{DIAS_SEMANA[mejorDia]}</div><div className="text-xs text-texto-2">{pesos(promedioDia[mejorDia])} en promedio por día</div></div>
          <div className="tarjeta"><div className="etiqueta">Día más flojo</div><div className="text-xl font-bold">{DIAS_SEMANA[peorDia]}</div><div className="text-xs text-texto-2">{pesos(promedioDia[peorDia])} en promedio por día</div></div>
          <div className="tarjeta"><div className="etiqueta">Hora pico</div><div className="text-xl font-bold">{hh(horaPico.h)}</div><div className="text-xs text-texto-2">{numero(horaPico.n)} ventas a esa hora</div></div>
          <div className="tarjeta"><div className="etiqueta">Franja más fuerte</div><div className="text-xl font-bold">{hh(franja.h)} a {hh(franja.h + 3)}</div><div className="text-xs text-texto-2">{Math.round((franja.n / totalVentas) * 100)} % de las ventas</div></div>
        </div>

        <section className="tarjeta space-y-2">
          <h2 className="flex items-center gap-2 font-semibold"><Flame size={17} className="text-marca" /> Mapa de ventas <span className="text-sm font-normal text-texto-2">(cantidad de ventas por día y hora)</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-center text-xs">
              <thead><tr><th className="w-20" />{horas.map((h) => <th key={h} className="font-normal text-texto-2">{h}</th>)}</tr></thead>
              <tbody>
                {DIAS_SEMANA.map((nombre, d) => (
                  <tr key={nombre}>
                    <th className="pr-2 text-right font-medium text-gray-700">{nombre.slice(0, 3)}</th>
                    {horas.map((h) => {
                      const c = celda[d][h];
                      return <td key={h} title={`${nombre} ${hh(h)}: ${c.n} ${c.n === 1 ? "venta" : "ventas"} · ${pesos(c.total)}`} className="h-8 rounded text-[11px] tabular-nums"
                        style={{ background: c.n ? `color-mix(in srgb, var(--color-marca) ${Math.round(15 + (c.n / maxCelda) * 85)}%, white)` : "#f3f4f6", color: c.n / maxCelda > 0.55 ? "#fff" : "#374151" }}>{c.n || ""}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-texto-2">Cuanto más oscuro, más ventas. Pasá el mouse (o tocá) una celda para ver cuánto se cobró.</p>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="tarjeta space-y-2">
            <h2 className="font-semibold">Por día de la semana <span className="text-sm font-normal text-texto-2">(cobrado promedio por día)</span></h2>
            {porDia.map((d, i) => (
              <div key={d.nombre} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
                <span>{d.nombre}</span><div className="h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full bg-marca" style={{ width: `${(promedioDia[i] / maxDia) * 100}%` }} /></div>
                <span className="tabular-nums text-texto-2">{pesos(promedioDia[i])} · {numero(d.n)} v.</span>
              </div>
            ))}
          </section>
          <section className="tarjeta space-y-2">
            <h2 className="flex items-center gap-2 font-semibold"><Clock size={16} /> Por hora <span className="text-sm font-normal text-texto-2">(ventas)</span></h2>
            {porHora.filter((x) => x.h >= desdeH && x.h <= hastaH).map((x) => (
              <div key={x.h} className="grid grid-cols-[3rem_1fr_2rem] items-center gap-2 text-sm">
                <span className="tabular-nums">{hh(x.h)}</span><div className="h-3 rounded-full bg-gray-100"><div className="h-3 rounded-full bg-marca" style={{ width: `${(x.n / maxHora) * 100}%` }} /></div>
                <span className="text-right tabular-nums text-texto-2">{x.n}</span>
              </div>
            ))}
          </section>
        </div>
        <p className="text-xs text-texto-2">Cuenta cada venta una vez, en hora argentina, sin las anuladas ni las devoluciones. «Cobrado» es el importe neto (con descuentos y recargos de los medios de pago).</p>
      </>}
    </div>
  );
}
