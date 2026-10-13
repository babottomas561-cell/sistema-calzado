// Promociones: cuánto se vendió con cada una, cuánto costó el descuento y si valió la pena (comparando su margen y el ticket de las ventas
// que la usaron contra lo que se vende sin promoción). Mismas cifras netas que el informe de Ventas.
import Link from "next/link";
import { BadgePercent, CircleAlert } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { leerTodo, limites, PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { type FilaDesglose } from "../Desglose";
import SelectorPeriodo from "../SelectorPeriodo";

const pct = (n: number) => `${Math.round(n * 10) / 10} %`.replace(".", ",");

export default async function InformePromociones({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const { permisos } = await exigir("informes.ventas");
  const conCostos = permisos.includes("costos.ver_ganancia");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const rango = rangoDe(periodo, diaArgentina(), sp.desde, sp.hasta);
  const l = limites(rango);
  const supabase = await crearCliente();
  const [items, { data: promos }] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_hechos_ventas")
      .select("id, venta_id, cantidad, precio_unitario, importe_neto, margen_neto, descuento_promo, promocion_id, promocion")
      .eq("es_devolucion", false).gte("fecha", l.gte).lt("fecha", l.lt).order("id").range(a, b)),
    supabase.from("promociones").select("id, nombre, activa, desde, hasta"),
  ]);

  type G = { id: number; nombre: string; ventas: Set<number>; unidades: number; vendido: number; descuento: number; lista: number; ganancia: number };
  const grupos = new Map<number, G>();
  const sinPromo = { vendido: 0, ganancia: 0 };
  const ventasConPromo = new Set<number>();
  const totalVenta = new Map<number, number>();
  for (const i of items) {
    const vendido = Number(i.importe_neto ?? 0), ganancia = Number(i.margen_neto ?? 0);
    if (i.venta_id) totalVenta.set(i.venta_id, (totalVenta.get(i.venta_id) ?? 0) + vendido);
    if (i.promocion_id === null) { sinPromo.vendido += vendido; sinPromo.ganancia += ganancia; continue; }
    if (i.venta_id) ventasConPromo.add(i.venta_id);
    const g = grupos.get(i.promocion_id) ?? { id: i.promocion_id, nombre: i.promocion ?? "Promoción", ventas: new Set<number>(), unidades: 0, vendido: 0, descuento: 0, lista: 0, ganancia: 0 };
    g.unidades += i.cantidad ?? 0; g.vendido += vendido; g.ganancia += ganancia; g.descuento += Number(i.descuento_promo ?? 0);
    g.lista += (i.cantidad ?? 0) * Number(i.precio_unitario ?? 0);
    if (i.venta_id) g.ventas.add(i.venta_id);
    grupos.set(i.promocion_id, g);
  }
  const lista = [...grupos.values()].sort((a, b) => b.vendido - a.vendido);
  const margenSin = sinPromo.vendido > 0 ? (sinPromo.ganancia / sinPromo.vendido) * 100 : 0;
  const margen = (g: G) => (g.vendido > 0 ? (g.ganancia / g.vendido) * 100 : 0);
  const totPromo = lista.reduce((t, g) => ({ vendido: t.vendido + g.vendido, descuento: t.descuento + g.descuento, ganancia: t.ganancia + g.ganancia, lista: t.lista + g.lista }), { vendido: 0, descuento: 0, ganancia: 0, lista: 0 });
  const ticket = (ids: Iterable<number>) => { let n = 0, s = 0; for (const id of ids) { n += 1; s += totalVenta.get(id) ?? 0; } return n ? s / n : 0; };
  const sinPromoIds = [...totalVenta.keys()].filter((id) => !ventasConPromo.has(id));
  const ticketCon = ticket(ventasConPromo), ticketSin = ticket(sinPromoIds);

  // Promociones vigentes que no se usaron en el período
  const ahora = new Date().toISOString();
  const sinUso = (promos ?? []).filter((p) => p.activa && (!p.desde || p.desde <= ahora) && (!p.hasta || p.hasta >= ahora) && !grupos.has(p.id));

  // Un veredicto corto por promoción (solo con ganancia visible: sin ella, solo lo que costó)
  const veredicto = (g: G) => {
    const costo = `El descuento costó ${pesos(g.descuento)} (${pct(g.lista > 0 ? (g.descuento / g.lista) * 100 : 0)} del precio de lista).`;
    if (!conCostos) return costo;
    const dif = margen(g) - margenSin;
    return `${costo} Margen ${pct(margen(g))} contra ${pct(margenSin)} de lo que se vende sin promoción: ${dif >= 0 ? `${pct(dif)} más` : `${pct(-dif)} menos`}.`;
  };

  const filas: FilaDesglose[] = lista.map((g) => ({
    clave: String(g.id), etiqueta: g.nombre, buscarTexto: g.nombre, principal: g.vendido, principalTexto: pesos(g.vendido),
    ordenValores: [g.ventas.size, g.unidades, g.vendido, g.descuento, g.lista > 0 ? (g.descuento / g.lista) * 100 : 0, ...(conCostos ? [g.ganancia, margen(g)] : [])],
    celdas: [numero(g.ventas.size), numero(g.unidades), pesos(g.vendido), pesos(g.descuento), pct(g.lista > 0 ? (g.descuento / g.lista) * 100 : 0), ...(conCostos ? [pesos(g.ganancia), pct(margen(g))] : [])],
    detalle: veredicto(g),
  }));
  const columnas = ["Promoción", "Ventas", "Unidades", "Vendido", "Descuento", "% de lista", ...(conCostos ? ["Ganancia", "Margen"] : [])];

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/promociones" periodo={periodo} rango={rango} />
      {lista.length === 0 ? <p className="tarjeta py-10 text-center text-sm text-texto-2">No se vendió nada con promociones en el período.</p> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="tarjeta"><div className="etiqueta">Vendido con promociones</div><div className="text-xl font-bold tabular-nums">{pesos(totPromo.vendido)}</div><div className="text-xs text-texto-2">{numero(ventasConPromo.size)} ventas</div></div>
          <div className="tarjeta"><div className="etiqueta">Lo que costó el descuento</div><div className="text-xl font-bold tabular-nums">{pesos(totPromo.descuento)}</div><div className="text-xs text-texto-2">{pct(totPromo.lista > 0 ? (totPromo.descuento / totPromo.lista) * 100 : 0)} del precio de lista</div></div>
          <div className="tarjeta"><div className="etiqueta">Ticket con promoción</div><div className="text-xl font-bold tabular-nums">{pesos(ticketCon)}</div><div className="text-xs text-texto-2">{ticketSin > 0 ? `contra ${pesos(ticketSin)} sin promoción` : "todas las ventas llevaron promoción"}</div></div>
          {conCostos && <div className="tarjeta"><div className="etiqueta">Margen con promociones</div><div className="text-xl font-bold tabular-nums">{pct(totPromo.vendido > 0 ? (totPromo.ganancia / totPromo.vendido) * 100 : 0)}</div><div className="text-xs text-texto-2">contra {pct(margenSin)} sin promoción</div></div>}
        </div>
        <Desglose titulo="Promociones usadas" total={totPromo.vendido} filas={filas} columnas={columnas}
          acciones={<BotonCSV archivo={`promociones-${rango.desde}-al-${rango.hasta}`} columnas={["Promoción", "Ventas", "Unidades", "Vendido", "Descuento", "% de lista", ...(conCostos ? ["Ganancia", "Margen %"] : [])]}
            filas={lista.map((g) => [g.nombre, g.ventas.size, g.unidades, g.vendido, g.descuento, Math.round((g.lista > 0 ? (g.descuento / g.lista) * 100 : 0) * 10) / 10, ...(conCostos ? [g.ganancia, Math.round(margen(g) * 10) / 10] : [])])} />} />
        <section className="tarjeta space-y-1 text-sm">
          <h2 className="flex items-center gap-2 font-semibold"><BadgePercent size={17} className="text-marca" /> ¿Valió la pena?</h2>
          {lista.map((g) => <p key={g.id}><b>{g.nombre}.</b> {veredicto(g)}</p>)}
          <p className="text-xs text-texto-2">El informe no puede saber cuánto se habría vendido sin la promoción: mide lo que costó y lo que dejó. Una promoción que baja mucho el margen tiene que traer bastante más volumen para compensar.</p>
        </section>
      </>}
      {sinUso.length > 0 && (
        <section className="tarjeta space-y-1 text-sm">
          <h2 className="flex items-center gap-2 font-semibold"><CircleAlert size={17} className="text-alerta" /> Vigentes y sin uso en el período</h2>
          <p>{sinUso.map((p) => p.nombre).join(" · ")}. <Link href="/admin/promociones" className="text-marca">Ver promociones</Link></p>
        </section>
      )}
    </div>
  );
}
