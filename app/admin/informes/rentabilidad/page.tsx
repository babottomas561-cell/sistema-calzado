// Rentabilidad: lo que MÁS DEJA, no solo lo que más factura. Abre la ganancia por rubro, marca, modelo, línea, temporada o género, y marca
// lo que factura mucho pero deja poco. Mismas cifras netas que el informe de Ventas (v_hechos_ventas); solo con «Ver la ganancia».
import Link from "next/link";
import { ArrowDown, ArrowUp, Gem, TriangleAlert } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { leerTodo, limites, PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { Agrupar, type FilaDesglose } from "../Desglose";
import SelectorPeriodo from "../SelectorPeriodo";

const POR = { rubro: "Rubro", marca: "Marca", modelo: "Modelo", linea: "Línea", temporada: "Temporada", genero: "Género" } as const;
type Por = keyof typeof POR;
const pct = (n: number) => `${Math.round(n)} %`;

export default async function Rentabilidad({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; por?: string }> }) {
  const { permisos } = await exigir("informes.ventas");
  if (!permisos.includes("costos.ver_ganancia")) return <p className="tarjeta text-sm text-texto-2">La rentabilidad necesita el permiso «Ver la ganancia». Pedíselo a un administrador.</p>;
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const por = (sp.por && sp.por in POR ? sp.por : "rubro") as Por;
  const rango = rangoDe(periodo, diaArgentina(), sp.desde, sp.hasta);
  const l = limites(rango);
  const supabase = await crearCliente();
  const items = await leerTodo((a, b) => supabase.from("v_hechos_ventas")
    .select("id, cantidad, importe_neto, margen_neto, rubro, marca, articulo, modelo, linea, temporada, genero")
    .gte("fecha", l.gte).lt("fecha", l.lt).order("id").range(a, b));

  type G = { etiqueta: string; vendido: number; ganancia: number; unidades: number };
  const grupos = new Map<string, G>();
  for (const i of items) {
    const [k, etiqueta] = por === "rubro" ? [i.rubro ?? "", i.rubro ?? "Sin rubro"] : por === "marca" ? [i.marca ?? "", i.marca ?? "Sin marca"]
      : por === "modelo" ? [i.articulo ?? "", `${i.articulo} · ${i.modelo}`] : por === "linea" ? [i.linea ?? "", i.linea ?? "Sin línea"]
      : por === "temporada" ? [i.temporada ?? "", i.temporada ?? "Sin temporada"] : [i.genero ?? "", i.genero ?? "Sin género"];
    const g = grupos.get(k) ?? { etiqueta, vendido: 0, ganancia: 0, unidades: 0 };
    g.vendido += Number(i.importe_neto ?? 0); g.ganancia += Number(i.margen_neto ?? 0); g.unidades += i.cantidad ?? 0;
    grupos.set(k, g);
  }
  const lista = [...grupos.values()].filter((g) => g.vendido !== 0 || g.ganancia !== 0).sort((a, b) => b.ganancia - a.ganancia);
  const tot = lista.reduce((t, g) => ({ vendido: t.vendido + g.vendido, ganancia: t.ganancia + g.ganancia, unidades: t.unidades + g.unidades }), { vendido: 0, ganancia: 0, unidades: 0 });
  const margenTotal = tot.vendido > 0 ? (tot.ganancia / tot.vendido) * 100 : 0;
  const margen = (g: G) => (g.vendido > 0 ? (g.ganancia / g.vendido) * 100 : 0);
  const porGanancia = new Map(lista.map((g, i) => [g, i + 1]));
  const porVentas = new Map([...lista].sort((a, b) => b.vendido - a.vendido).map((g, i) => [g, i + 1]));
  const top3 = lista.slice(0, 3).reduce((s, g) => s + g.ganancia, 0);

  // «Factura mucho y deja poco»: pesa en las ventas (≥ 5 %) pero su margen es bastante menor que el del conjunto
  const alertas = lista.filter((g) => tot.vendido > 0 && g.vendido / tot.vendido >= 0.05 && margen(g) < margenTotal * 0.8 && tot.ganancia > 0)
    .sort((a, b) => b.vendido - a.vendido).slice(0, 5);

  const filas: FilaDesglose[] = lista.map((g) => ({
    clave: g.etiqueta, etiqueta: g.etiqueta, buscarTexto: g.etiqueta, principal: Math.max(g.ganancia, 0), principalTexto: pesos(g.ganancia),
    ordenValores: [g.vendido, g.ganancia, margen(g), g.unidades ? g.ganancia / g.unidades : 0, porVentas.get(g)!, porGanancia.get(g)!],
    celdas: [pesos(g.vendido), pesos(g.ganancia), pct(margen(g)), pesos(g.unidades ? g.ganancia / g.unidades : 0), `${porVentas.get(g)}°`, `${porGanancia.get(g)}°`],
    detalle: `vendido ${pesos(g.vendido)} · margen ${pct(margen(g))} · puesto ${porVentas.get(g)}° en ventas y ${porGanancia.get(g)}° en ganancia`,
  }));
  const periodoUrl = periodo === "rango" ? `&periodo=rango&desde=${rango.desde}&hasta=${rango.hasta}` : `&periodo=${periodo}`;

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/rentabilidad" periodo={periodo} rango={rango} extra={`&por=${por}`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Ganancia bruta</div><div className="text-xl font-bold tabular-nums">{pesos(tot.ganancia)}</div><div className="text-xs text-texto-2">sobre {pesos(tot.vendido)} vendidos</div></div>
        <div className="tarjeta"><div className="etiqueta">Margen general</div><div className="text-xl font-bold tabular-nums">{pct(margenTotal)}</div><div className="text-xs text-texto-2">de cada $ 100 vendidos, quedan {pesos(margenTotal)}</div></div>
        <div className="tarjeta"><div className="etiqueta">Ganancia por unidad</div><div className="text-xl font-bold tabular-nums">{pesos(tot.unidades ? tot.ganancia / tot.unidades : 0)}</div><div className="text-xs text-texto-2">{numero(tot.unidades)} unidades</div></div>
        <div className="tarjeta"><div className="etiqueta">Concentración</div><div className="text-xl font-bold tabular-nums">{tot.ganancia > 0 ? pct((top3 / tot.ganancia) * 100) : "—"}</div><div className="text-xs text-texto-2">de la ganancia viene de los 3 primeros</div></div>
      </div>

      {alertas.length > 0 && (
        <section className="tarjeta space-y-2 border-amber-300 bg-amber-50">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900"><TriangleAlert size={17} /> Facturan mucho y dejan poco</h2>
          <ul className="space-y-1 text-sm">
            {alertas.map((g) => <li key={g.etiqueta}><b>{g.etiqueta}</b>: es el {pct((g.vendido / tot.vendido) * 100)} de lo vendido pero deja el {pct((g.ganancia / tot.ganancia) * 100)} de la ganancia (margen {pct(margen(g))} contra {pct(margenTotal)} del total).</li>)}
          </ul>
          <p className="text-xs text-amber-900/80">Puede ser un precio de venta bajo o un costo alto. Mirá los precios de compra de lo que vendés más.</p>
        </section>
      )}
      {lista.length > 0 && (
        <section className="tarjeta space-y-1">
          <h2 className="flex items-center gap-2 font-semibold"><Gem size={17} className="text-marca" /> Lo que más deja</h2>
          <ol className="space-y-0.5 text-sm">
            {lista.slice(0, 3).map((g, i) => <li key={g.etiqueta}><span className="mr-2 font-bold text-marca">{i + 1}°</span><b>{g.etiqueta}</b> · {pesos(g.ganancia)} (margen {pct(margen(g))}){porVentas.get(g) !== i + 1 ? <span className="ml-1 text-texto-2">— es el {porVentas.get(g)}° en ventas {porVentas.get(g)! > i + 1 ? <ArrowUp size={12} className="inline text-ok" /> : <ArrowDown size={12} className="inline text-error" />}</span> : null}</li>)}
          </ol>
        </section>
      )}

      <Agrupar base="/admin/informes/rentabilidad" opciones={POR} actual={por} extra={periodoUrl} />
      <Desglose titulo={`Ganancia por ${POR[por].toLowerCase()}`} total={Math.max(tot.ganancia, 0)} filas={filas} columnas={[POR[por], "Vendido", "Ganancia", "Margen", "Ganancia por unidad", "Puesto en ventas", "Puesto en ganancia"]}
        acciones={<BotonCSV archivo={`rentabilidad-por-${por}-${rango.desde}-al-${rango.hasta}`} columnas={[POR[por], "Vendido", "Ganancia", "Margen %", "Ganancia por unidad", "Puesto en ventas", "Puesto en ganancia"]}
          filas={lista.map((g) => [g.etiqueta, g.vendido, g.ganancia, Math.round(margen(g) * 10) / 10, g.unidades ? g.ganancia / g.unidades : 0, porVentas.get(g)!, porGanancia.get(g)!])} />} />
      <p className="text-xs text-texto-2">Ganancia = lo vendido (neto de descuentos y recargos) menos el costo de compra al momento de vender, con las devoluciones restadas. Los puestos comparan cada grupo contra los demás del mismo período: <Link href={`/admin/informes/ventas?por=${por === "linea" || por === "genero" || por === "temporada" ? por : por}${periodoUrl}`} className="text-marca">ver las ventas</Link>.</p>
    </div>
  );
}
