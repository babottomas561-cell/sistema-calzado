// Informe de ventas de un período: totales comparados con el período anterior, ventas por día
// y el detalle abierto por rubro, marca, modelo, talle, color, canal, cliente o medio de pago.
// Importes NETOS: con el descuento manual y el ajuste por medio de pago ya prorrateados
// (v_hechos_ventas), los mismos que suman el Inicio y la pantalla de Ventas.
import { LINEAS, ordenEscala, rotuloTalle } from "@/lib/escalas";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { diasDe, diasEntre, leerTodo, limites, PERIODOS, rangoAnterior, rangoDe, type Periodo, type Rango } from "@/lib/informes";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { Agrupar, type FilaDesglose } from "../Desglose";
import SelectorPeriodo from "../SelectorPeriodo";
import GraficoVentas, { type Punto } from "./GraficoVentas";
import { exigir } from "@/lib/exigir";

const POR = { linea: "Línea", rubro: "Rubro", temporada: "Temporada", genero: "Género", marca: "Marca", modelo: "Modelo", talle: "Talle", color: "Color", canal: "Canal", vendedor: "Vendedor", promocion: "Promoción", cliente: "Cliente", medio: "Medio de pago" } as const;
type Por = keyof typeof POR;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
// Con el año solo si no es el actual (si no, "23/03 al 31/12" no dice de qué año es)
const textoRango = (r: Rango, anio: string) => {
  const dia = (d: string) => (d.slice(0, 4) === anio ? diaCorto(d) : `${diaCorto(d)}/${d.slice(2, 4)}`);
  return r.desde === r.hasta ? dia(r.desde) : `${dia(r.desde)} al ${dia(r.hasta)}`;
};

function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (!anterior) return <span className="text-texto-2">sin datos para comparar</span>;
  const v = Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
  const Icono = v >= 0 ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${v >= 0 ? "text-ok" : "text-error"}`}><Icono size={14} strokeWidth={2.2} />{v >= 0 ? "+" : ""}{v} %</span>;
}

export default async function InformeVentas({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; por?: string }> }) {
  const { permisos } = await exigir("informes.ventas");
  // Sin "Ver costos" la base devuelve la ganancia vacía: no se muestra
  const conCostos = permisos.includes("costos.ver");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const por = (sp.por && sp.por in POR ? sp.por : "modelo") as Por;
  const hoy = diaArgentina();
  const rango = rangoDe(periodo, hoy, sp.desde, sp.hasta);
  const anterior = rangoAnterior(periodo, rango);
  const [l, la] = [limites(rango), limites(anterior)];

  const supabase = await crearCliente();
  const [items, itemsAnt, pagos] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_hechos_ventas")
      .select("id, venta_id, dia, cantidad, importe, importe_neto, margen_neto, canal, rubro, marca, articulo, modelo, talle, talle_orden, escala, temporada, linea, genero, color, cliente, cliente_codigo, vendedor_id, vendedor, promocion_id, promocion, descuento_promo")
      .gte("fecha", l.gte).lt("fecha", l.lt).order("id").range(a, b)),
    leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, venta_id, cantidad, importe_neto, margen_neto")
      .gte("fecha", la.gte).lt("fecha", la.lt).order("id").range(a, b)),
    // Medio de pago va por pago (una venta puede pagarse con dos), no por artículo
    por === "medio" ? leerTodo((a, b) => supabase.from("pagos").select("id, venta_id, monto, ajuste, medios_pago(nombre), ventas!inner(fecha, anulada_en)")
      .gte("ventas.fecha", l.gte).lt("ventas.fecha", l.lt).is("ventas.anulada_en", null).order("id").range(a, b)) : Promise.resolve([]),
  ]);

  const resumen = (lista: { venta_id: number | null; cantidad: number | null; importe_neto: number | null; margen_neto: number | null }[]) => {
    const r = { vendido: 0, ganancia: 0, unidades: 0, ventas: new Set(lista.map((i) => i.venta_id).filter(Boolean)).size };
    lista.forEach((i) => { r.vendido += Number(i.importe_neto ?? 0); r.ganancia += Number(i.margen_neto ?? 0); r.unidades += i.cantidad ?? 0; });
    return r;
  };
  const act = resumen(items), ant = resumen(itemsAnt);
  // Lo que se resignó en promociones (va aparte de los descuentos manuales y por medio de pago)
  const enPromos = items.reduce((s, i) => s + Number(i.descuento_promo ?? 0), 0);
  const ajustes = items.reduce((s, i) => s + Number(i.importe_neto ?? 0) - Number(i.importe ?? 0), 0) + enPromos;
  const margenPct = (g: number, v: number) => (v > 0 ? Math.round((g / v) * 100) : 0);

  // ── Gráfico: por día, o por mes si el período pasa de dos meses ──
  const porMes = diasEntre(rango) > 62;
  const puntos = new Map<string, Punto & { ids: Set<number> }>();
  for (const d of diasDe(rango)) {
    const k = porMes ? d.slice(0, 7) : d;
    if (!puntos.has(k)) puntos.set(k, { clave: k, etiqueta: porMes ? `${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(2, 4)}` : diaCorto(d), total: 0, ventas: 0, unidades: 0, ids: new Set() });
  }
  for (const i of items) {
    const p = puntos.get(porMes ? (i.dia ?? "").slice(0, 7) : i.dia ?? "");
    if (!p) continue;
    p.total += Number(i.importe_neto ?? 0); p.unidades += i.cantidad ?? 0; if (i.venta_id) p.ids.add(i.venta_id); p.ventas = p.ids.size;
  }

  // ── Desglose ──
  type Grupo = { etiqueta: string; orden: number; vendido: number; ganancia: number; unidades: number; ventas: Set<number> };
  const grupos = new Map<string, Grupo>();
  const sumar = (k: string, etiqueta: string, orden: number, vendido: number, ganancia: number, unidades: number, venta: number) => {
    const g = grupos.get(k) ?? { etiqueta, orden, vendido: 0, ganancia: 0, unidades: 0, ventas: new Set<number>() };
    g.vendido += vendido; g.ganancia += ganancia; g.unidades += unidades; if (venta) g.ventas.add(venta);   // las devoluciones (venta 0) restan pero no son ventas
    grupos.set(k, g);
  };
  if (por === "medio") {
    for (const p of pagos as { venta_id: number; monto: number; medios_pago: { nombre: string } | null }[]) {
      const n = p.medios_pago?.nombre ?? "—";
      sumar(n, n, 0, Number(p.monto), 0, 0, p.venta_id);
    }
  } else {
    for (const i of items) {
      const [k, etiqueta, orden] =
        por === "linea" ? [i.linea ?? "", i.linea ?? "Sin línea", LINEAS.indexOf((i.linea ?? "") as never)]
        : por === "rubro" ? [i.rubro ?? "", i.rubro ?? "Sin rubro", 0]
        : por === "temporada" ? [i.temporada ?? "", i.temporada ?? "Sin temporada", 0]
        : por === "genero" ? [i.genero ?? "", i.genero ?? "Sin género", 0]
        : por === "marca" ? [i.marca ?? "", i.marca ?? "Sin marca", 0]
        : por === "modelo" ? [i.articulo ?? "", `${i.articulo} · ${i.modelo}`, 0]
        : por === "talle" ? [`${i.escala}|${i.talle}`, rotuloTalle(i.talle, i.escala), ordenEscala(i.escala) * 10000 + Number(i.talle_orden)]
        : por === "color" ? [i.color ?? "", i.color ?? "", 0]
        : por === "canal" ? [i.canal ?? "", i.canal ?? "—", 0]
        : por === "vendedor" ? [i.vendedor_id ?? "", i.vendedor ?? "Sin registrar", 0]
        : por === "promocion" ? [String(i.promocion_id ?? ""), i.promocion ?? "Sin promoción", 0]
        : [i.cliente_codigo ? String(i.cliente_codigo) : "", i.cliente ? `${i.cliente_codigo} · ${i.cliente}` : "Sin cliente (mostrador)", 0];
      sumar(k, etiqueta, orden, Number(i.importe_neto ?? 0), Number(i.margen_neto ?? 0), i.cantidad ?? 0, i.venta_id ?? 0);
    }
  }
  const lista = [...grupos.entries()].sort(([, a], [, b]) => (por === "talle" || por === "linea" ? a.orden - b.orden : b.vendido - a.vendido));
  const totalDesglose = lista.reduce((s, [, g]) => s + g.vendido, 0);

  const esMedio = por === "medio";
  const columnas = esMedio ? [POR[por], "Ventas", "Cobrado"] : [POR[por], "Unidades", "Ventas", "Vendido", ...(conCostos ? ["Ganancia", "Margen"] : [])];
  const filas: FilaDesglose[] = lista.map(([k, g]) => ({
    clave: k || "—", etiqueta: g.etiqueta, principal: g.vendido, principalTexto: pesos(g.vendido),
    celdas: esMedio ? [numero(g.ventas.size), pesos(g.vendido)]
      : [numero(g.unidades), numero(g.ventas.size), pesos(g.vendido), ...(conCostos ? [pesos(g.ganancia), `${margenPct(g.ganancia, g.vendido)} %`] : [])],
    detalle: esMedio ? `${g.ventas.size} venta${g.ventas.size === 1 ? "" : "s"}`
      : `${numero(g.unidades)} unidades · ${g.ventas.size} venta${g.ventas.size === 1 ? "" : "s"}${conCostos ? ` · ganancia ${pesos(g.ganancia)} (${margenPct(g.ganancia, g.vendido)} %)` : ""}`,
  }));

  const params = periodo === "rango" ? `&periodo=rango&desde=${rango.desde}&hasta=${rango.hasta}` : `&periodo=${periodo}`;
  const kpis = [
    { titulo: "Vendido", valor: pesos(act.vendido), extra: <Variacion actual={act.vendido} anterior={ant.vendido} /> },
    ...(conCostos ? [{ titulo: "Ganancia bruta", valor: pesos(act.ganancia), extra: <span className="text-texto-2">{margenPct(act.ganancia, act.vendido)} % de lo vendido</span> }] : []),
    { titulo: "Ventas", valor: numero(act.ventas), extra: <Variacion actual={act.ventas} anterior={ant.ventas} /> },
    { titulo: "Unidades", valor: numero(act.unidades), extra: <Variacion actual={act.unidades} anterior={ant.unidades} /> },
    { titulo: "Ticket promedio", valor: pesos(act.ventas ? act.vendido / act.ventas : 0), extra: <span className="text-texto-2">{act.ventas ? `${(act.unidades / act.ventas).toFixed(1).replace(".", ",")} unidades por venta` : "—"}</span> },
    { titulo: ajustes <= 0 ? "Descuentos" : "Recargos", valor: pesos(Math.abs(ajustes)), extra: <span className="text-texto-2">manuales y por medio de pago</span> },
    ...(enPromos > 0 ? [{ titulo: "En promociones", valor: pesos(enPromos), extra: <span className="text-texto-2">lo que se resignó (2×1, % off…)</span> }] : []),
  ];

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/ventas" periodo={periodo} rango={rango} extra={`&por=${por}`} />
      <p className="text-sm text-texto-2">Del <b className="text-gray-900">{textoRango(rango, hoy.slice(0, 4))}</b> · comparado con el {textoRango(anterior, hoy.slice(0, 4))}</p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.titulo} className="tarjeta"><div className="etiqueta">{k.titulo}</div>
            <div className="text-lg font-bold tabular-nums md:text-xl">{k.valor}</div><div className="text-xs">{k.extra}</div></div>
        ))}
      </div>

      <GraficoVentas titulo={porMes ? "Vendido por mes" : "Vendido por día"} puntos={[...puntos.values()]} />

      <Agrupar base="/admin/informes/ventas" opciones={POR} actual={por} extra={params} />

      <Desglose titulo={`Ventas por ${POR[por].toLowerCase()}`} total={totalDesglose} filas={filas} columnas={columnas}
        acciones={<BotonCSV archivo={`ventas-por-${por}-${rango.desde}-al-${rango.hasta}`}
          columnas={esMedio ? [POR[por], "Ventas", "Cobrado"] : [POR[por], "Unidades", "Ventas", "Vendido", ...(conCostos ? ["Ganancia", "Margen %"] : [])]}
          filas={lista.map(([, g]) => esMedio ? [g.etiqueta, g.ventas.size, g.vendido]
            : [g.etiqueta, g.unidades, g.ventas.size, g.vendido, ...(conCostos ? [g.ganancia, margenPct(g.ganancia, g.vendido)] : [])])} />} />

      <p className="text-xs text-texto-2">
        {esMedio ? "Lo que entró por cada medio, ya con su descuento o recargo: es lo que tiene que haber en caja o en el banco. Una venta pagada con dos medios cuenta en los dos."
          : "Importes netos: con el descuento del vendedor y el ajuste por medio de pago repartidos entre los artículos de cada venta. La ganancia es lo vendido menos el costo de compra al momento de vender."}
      </p>
    </div>
  );
}
