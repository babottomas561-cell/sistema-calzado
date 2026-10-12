// Resultado del período: ventas − costo de lo vendido = ganancia bruta; − pérdidas (fallados dados de baja)
// − gastos (por categoría) = ganancia neta. Las ventas salen de v_hechos_ventas (netas: devoluciones restadas,
// descuentos y ajustes por medio de pago prorrateados), las mismas que el informe de Ventas.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { diaArgentina, pesos } from "@/lib/formato";
import { leerTodo, limites, PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import SelectorPeriodo from "../SelectorPeriodo";

function Fila({ texto, monto, fuerte = false, resta = false, nota }: { texto: string; monto: number; fuerte?: boolean; resta?: boolean; nota?: string }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-2 ${fuerte ? "border-t border-borde font-bold" : ""}`}>
      <span>{texto}{nota && <span className="block text-xs font-normal text-texto-2">{nota}</span>}</span>
      <span className={`shrink-0 ${fuerte ? "text-lg" : ""} ${fuerte && monto < 0 ? "text-error" : ""}`}>{resta && monto ? "−" : ""}{pesos(Math.abs(monto) * (fuerte && monto < 0 ? -1 : 1))}</span>
    </div>
  );
}

export default async function Resultado({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  const { permisos } = await exigir("gastos.gestionar");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const rango = rangoDe(periodo, diaArgentina(), sp.desde, sp.hasta);
  // Sin ver costos ni ventas no hay resultado que mostrar (la base devolvería todo vacío)
  if (!permisos.includes("costos.ver") || !permisos.includes("informes.ventas"))
    return <p className="tarjeta text-sm text-texto-2">El resultado necesita además los permisos «Ver costos» y «Ventas por período». Ver solo los <Link href="/admin/gastos" className="text-marca">gastos</Link>.</p>;

  const l = limites(rango);
  const supabase = await crearCliente();
  await supabase.rpc("generar_gastos_fijos");
  const [items, perdidas, gastos, envios] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, importe_neto, margen_neto").gte("fecha", l.gte).lt("fecha", l.lt).order("id").range(a, b)),
    leerTodo((a, b) => supabase.from("v_perdidas_fallados").select("dia, costo").gte("dia", rango.desde).lte("dia", rango.hasta).order("dia").range(a, b)),
    leerTodo((a, b) => supabase.from("gastos").select("id, monto, gasto_categorias(nombre, orden)").gte("fecha", rango.desde).lte("fecha", rango.hasta).order("id").range(a, b)),
    // Lo que pagaron los clientes por el envío (va aparte de la venta); lo que costó está en Gastos → Envíos
    leerTodo((a, b) => supabase.from("v_envios_cobrados").select("dia, cobrado").gte("dia", rango.desde).lte("dia", rango.hasta).order("dia").range(a, b)),
  ]);

  const ventas = items.reduce((s, i) => s + Number(i.importe_neto ?? 0), 0);
  const bruta = items.reduce((s, i) => s + Number(i.margen_neto ?? 0), 0);
  const perdido = perdidas.reduce((s, p) => s + Number(p.costo ?? 0), 0);
  const categorias = [...gastos.reduce((m, g) => {
    const c = g.gasto_categorias; const k = c?.nombre ?? "Otros";
    return m.set(k, { orden: c?.orden ?? 99, monto: (m.get(k)?.monto ?? 0) + Number(g.monto ?? 0) });
  }, new Map<string, { orden: number; monto: number }>())].sort((a, b) => a[1].orden - b[1].orden);
  const totalGastos = categorias.reduce((s, [, c]) => s + c.monto, 0);
  const cobradoEnvios = envios.reduce((s, e) => s + Number(e.cobrado ?? 0), 0);
  const neta = bruta + cobradoEnvios - perdido - totalGastos;
  const pct = (n: number) => (ventas > 0 ? `${Math.round((n / ventas) * 100)} % de lo vendido` : undefined);

  return (
    <div className="space-y-4">
      <SelectorPeriodo base="/admin/informes/resultado" periodo={periodo} rango={rango} />
      <section className="tarjeta max-w-xl text-sm">
        <Fila texto="Ventas" monto={ventas} nota="Netas: con descuentos y devoluciones" />
        <Fila texto="Costo de lo vendido" monto={ventas - bruta} resta />
        <Fila texto="Ganancia bruta" monto={bruta} fuerte nota={pct(bruta)} />
        {cobradoEnvios > 0 && <Fila texto="Envíos cobrados" monto={cobradoEnvios} nota="Lo que pagaron los clientes; lo que costó, abajo en Envíos" />}
        {perdido > 0 && <Fila texto="Fallados dados de baja" monto={perdido} resta nota="A su costo" />}
        {categorias.map(([nombre, c]) => <Fila key={nombre} texto={nombre} monto={c.monto} resta />)}
        {!categorias.length && <p className="py-2 text-texto-2">Sin gastos cargados en el período. <Link href="/admin/gastos" className="text-marca">Cargar gastos</Link></p>}
        <Fila texto="Ganancia neta" monto={neta} fuerte nota={pct(neta)} />
      </section>
    </div>
  );
}
