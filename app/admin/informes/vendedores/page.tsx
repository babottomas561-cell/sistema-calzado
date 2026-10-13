// Vendedores: ventas, ticket y descuentos de cada persona del equipo (manuales y autorizados con PIN) y ventas anuladas. Sirve para ver quién usa
// mucho el descuento. No muestra costos. Solo con «Ventas por período».
import { ShieldAlert } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { type FilaDesglose } from "../Desglose";
import SelectorPeriodo from "../SelectorPeriodo";

const pct = (n: number) => `${Math.round(n * 10) / 10} %`.replace(".", ",");
const plural = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;

export default async function InformeVendedores({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  await exigir("informes.ventas");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const rango = rangoDe(periodo, diaArgentina(), sp.desde, sp.hasta);
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("informe_vendedores", { p_desde: rango.desde, p_hasta: rango.hasta });
  if (error) throw new Error(error.message);
  const todos = (data ?? []).map((v) => ({
    id: v.vendedor_id ?? "sin", nombre: v.nombre, ventas: Number(v.ventas), unidades: Number(v.unidades), cobrado: Number(v.cobrado), base: Number(v.base_descuento),
    descuento: Number(v.descuento_manual), conDescuento: Number(v.ventas_con_descuento), maxPct: Number(v.descuento_max_pct), pin: Number(v.con_pin), anuladas: Number(v.anuladas),
  })).filter((v) => v.ventas > 0 || v.anuladas > 0);
  const pctDesc = (v: { descuento: number; base: number }) => (v.base > 0 ? (v.descuento / v.base) * 100 : 0);
  const tot = todos.reduce((t, v) => ({ ventas: t.ventas + v.ventas, cobrado: t.cobrado + v.cobrado, descuento: t.descuento + v.descuento, base: t.base + v.base, pin: t.pin + v.pin, anuladas: t.anuladas + v.anuladas, unidades: t.unidades + v.unidades }), { ventas: 0, cobrado: 0, descuento: 0, base: 0, pin: 0, anuladas: 0, unidades: 0 });
  const pctGeneral = pctDesc(tot);
  // A revisar: descuenta bastante más que el promedio del local (con varias ventas con descuento), o tiene varias anuladas
  const revisar = todos.filter((v) => v.conDescuento >= 3 && pctDesc(v) >= Math.max(pctGeneral * 1.5, 3)).concat(todos.filter((v) => v.anuladas >= 3 && !(v.conDescuento >= 3 && pctDesc(v) >= Math.max(pctGeneral * 1.5, 3))));

  const filas: FilaDesglose[] = todos.map((v) => {
    const ticket = v.ventas ? v.cobrado / v.ventas : 0;
    return {
      clave: v.id, etiqueta: v.nombre, buscarTexto: v.nombre, principal: v.cobrado, principalTexto: pesos(v.cobrado),
      ordenValores: [v.ventas, v.unidades, v.cobrado, ticket, v.descuento, pctDesc(v), v.pin, v.anuladas],
      celdas: [numero(v.ventas), numero(v.unidades), pesos(v.cobrado), pesos(ticket), pesos(v.descuento), pct(pctDesc(v)), numero(v.pin), numero(v.anuladas)],
      detalle: `${plural(v.ventas, "venta", "ventas")} · ticket ${pesos(ticket)} · descuento ${pesos(v.descuento)} (${pct(pctDesc(v))})${v.pin ? ` · ${plural(v.pin, "autorización con PIN", "autorizaciones con PIN")}` : ""}${v.anuladas ? ` · ${plural(v.anuladas, "anulada", "anuladas")}` : ""}`,
    };
  });

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/vendedores" periodo={periodo} rango={rango} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Cobrado</div><div className="text-xl font-bold tabular-nums">{pesos(tot.cobrado)}</div><div className="text-xs text-texto-2">{plural(tot.ventas, "venta", "ventas")} de {plural(todos.filter((v) => v.ventas > 0).length, "persona", "personas")}</div></div>
        <div className="tarjeta"><div className="etiqueta">Ticket promedio</div><div className="text-xl font-bold tabular-nums">{pesos(tot.ventas ? tot.cobrado / tot.ventas : 0)}</div><div className="text-xs text-texto-2">{plural(tot.unidades, "unidad", "unidades")}</div></div>
        <div className="tarjeta"><div className="etiqueta">Descuentos manuales</div><div className="text-xl font-bold tabular-nums">{pesos(tot.descuento)}</div><div className="text-xs text-texto-2">{pct(pctGeneral)} de lo vendido (sin promociones)</div></div>
        <div className="tarjeta"><div className="etiqueta">Con PIN de encargado</div><div className="text-xl font-bold tabular-nums">{numero(tot.pin)}</div><div className="text-xs text-texto-2">descuentos sobre el tope · {plural(tot.anuladas, "venta anulada", "ventas anuladas")}</div></div>
      </div>

      {revisar.length > 0 && (
        <section className="tarjeta space-y-1.5 border-amber-300 bg-amber-50 text-sm">
          <h2 className="flex items-center gap-2 font-semibold text-amber-900"><ShieldAlert size={17} /> Para revisar</h2>
          {revisar.map((v) => <p key={v.id}><b>{v.nombre}</b>: {v.conDescuento >= 3 && pctDesc(v) >= Math.max(pctGeneral * 1.5, 3) ? `descuenta el ${pct(pctDesc(v))} de lo que vende (el promedio del local es ${pct(pctGeneral)}), en ${plural(v.conDescuento, "venta", "ventas")}; el mayor fue del ${pct(v.maxPct)}.` : ""}{v.anuladas >= 3 ? ` Tiene ${plural(v.anuladas, "venta anulada", "ventas anuladas")}.` : ""}</p>)}
          <p className="text-xs text-amber-900/80">Es una señal, no una acusación: puede ser que atienda a clientes que piden más rebaja. El detalle de cada descuento autorizado está en la Bitácora.</p>
        </section>
      )}

      <Desglose titulo="Ventas por vendedor" total={tot.cobrado} filas={filas} columnas={["Vendedor", "Ventas", "Unidades", "Cobrado", "Ticket", "Descuento manual", "% descuento", "Con PIN", "Anuladas"]}
        acciones={<BotonCSV archivo={`vendedores-${rango.desde}-al-${rango.hasta}`} columnas={["Vendedor", "Ventas", "Unidades", "Cobrado", "Ticket", "Descuento manual", "% descuento", "Descuento máximo %", "Con PIN", "Anuladas"]}
          filas={todos.map((v) => [v.nombre, v.ventas, v.unidades, v.cobrado, v.ventas ? v.cobrado / v.ventas : 0, v.descuento, Math.round(pctDesc(v) * 10) / 10, v.maxPct, v.pin, v.anuladas])} />} />
      <p className="text-xs text-texto-2">Cobrado es el total de cada venta (con los recargos y descuentos de los medios de pago). El «% descuento» es el descuento manual sobre el precio después de promociones. «Con PIN» son los descuentos por encima del tope de esa persona que autorizó un encargado.</p>
    </div>
  );
}
