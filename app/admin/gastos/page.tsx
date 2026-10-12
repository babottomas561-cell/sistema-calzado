// Gastos del local: lo que se gastó en el período (por categoría y uno por uno), los fijos que se cargan solos
// cada mes y la cotización del dólar. Los automáticos (WhatsApp de Meta, IA) los carga el sistema y no se borran.
import { Trash2, Zap, Repeat } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { dia, diaArgentina, fecha, pesos } from "@/lib/formato";
import { leerTodo, PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import SelectorPeriodo from "../informes/SelectorPeriodo";
import { CargarFijo, CargarGasto, Dolar } from "./Formularios";
import { activarFijo, borrarGasto } from "./acciones";

const ORIGEN = { manual: null, fijo: { texto: "Fijo", icono: Repeat }, automatico: { texto: "Automático", icono: Zap } } as const;

export default async function Gastos({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  await exigir("gastos.gestionar");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const hoy = diaArgentina();
  const rango = rangoDe(periodo, hoy, sp.desde, sp.hasta);
  const supabase = await crearCliente();
  // Los fijos cuyo día ya llegó se cargan al abrir (además de cada mañana, por si el cron no corrió)
  await supabase.rpc("generar_gastos_fijos");
  const [{ data: categorias }, { data: proveedores }, { data: config }, { data: fijos }, gastos] = await Promise.all([
    supabase.from("gasto_categorias").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("configuracion_gastos").select("dolar, dolar_actualizado").single(),
    supabase.from("gastos_fijos").select("id, descripcion, moneda, importe, dia, activo, gasto_categorias(nombre)").order("activo", { ascending: false }).order("descripcion"),
    leerTodo((a, b) => supabase.from("gastos")
      .select("id, fecha, descripcion, moneda, importe, cotizacion, monto, origen, nota, gasto_categorias(nombre), proveedores(nombre)")
      .gte("fecha", rango.desde).lte("fecha", rango.hasta).order("fecha", { ascending: false }).order("id", { ascending: false }).range(a, b)),
  ]);
  const dolar = Number(config?.dolar ?? 1);
  const total = gastos.reduce((s, g) => s + Number(g.monto ?? 0), 0);
  const porCategoria = [...gastos.reduce((m, g) => m.set(g.gasto_categorias?.nombre ?? "—", (m.get(g.gasto_categorias?.nombre ?? "—") ?? 0) + Number(g.monto ?? 0)), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Gastos</h1>
          <p className="text-sm text-texto-2">Lo que cuesta mantener el local: se resta en Informes → Resultado.</p></div>
        <div className="space-y-0.5"><Dolar dolar={dolar} />
          {config?.dolar_actualizado && <p className="text-xs text-texto-2">Actualizado el {fecha(config.dolar_actualizado)}</p>}
          {dolar <= 1 && <p className="text-xs font-semibold text-error">Cargá la cotización del dólar: se usa para los gastos en dólares (Meta, Vercel, IA).</p>}</div>
      </div>
      <SelectorPeriodo base="/admin/gastos" periodo={periodo} rango={rango} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <section className="tarjeta space-y-3">
            <div className="flex items-baseline justify-between"><h2 className="font-semibold">Total del período</h2><span className="text-2xl font-bold">{pesos(total)}</span></div>
            {porCategoria.length > 0 && (
              <ul className="space-y-2 text-sm">{porCategoria.map(([c, m]) => (
                <li key={c}>
                  <div className="flex justify-between"><span>{c}</span><span className="font-semibold">{pesos(m)}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-marca" style={{ width: `${Math.max(2, (m / total) * 100)}%` }} /></div>
                </li>
              ))}</ul>
            )}
          </section>

          <section className="tarjeta">
            <h2 className="mb-2 font-semibold">Uno por uno</h2>
            {!gastos.length && <p className="text-sm text-texto-2">No hay gastos en este período.</p>}
            <ul className="divide-y divide-gray-100 text-sm">{gastos.map((g) => {
              const o = ORIGEN[g.origen as keyof typeof ORIGEN];
              return (
                <li key={g.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium">{g.descripcion}</p>
                    <p className="text-xs text-texto-2">{dia(g.fecha)} · {g.gasto_categorias?.nombre}{g.proveedores?.nombre && ` · ${g.proveedores.nombre}`}
                      {o && <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-gray-100 px-1.5 py-0.5 align-middle"><o.icono size={11} strokeWidth={2.2} />{o.texto}</span>}</p>
                    {g.moneda === "USD" && <p className="text-xs text-texto-2">US$ {Number(g.importe).toLocaleString("es-AR")} × {pesos(g.cotizacion)}</p>}
                    {g.nota && <p className="text-xs text-texto-2">«{g.nota}»</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="font-semibold">{pesos(g.monto)}</span>
                    {g.origen !== "automatico" && (
                      <form action={borrarGasto}><input type="hidden" name="id" value={g.id} />
                        <button className="rounded p-1.5 text-texto-2 hover:bg-gray-100 hover:text-error" aria-label={`Borrar ${g.descripcion}`}><Trash2 size={15} strokeWidth={1.8} /></button></form>
                    )}
                  </div>
                </li>
              );
            })}</ul>
          </section>
        </div>

        <div className="space-y-5">
          <CargarGasto key={dolar} categorias={categorias ?? []} proveedores={proveedores ?? []} dolar={dolar} hoy={hoy} />
          <section className="tarjeta space-y-3">
            <div><h2 className="font-semibold">Gastos fijos por mes</h2>
              <p className="text-sm text-texto-2">Se cargan solos el día que vencen. Los de dólares, con el dólar de ese día.</p></div>
            <ul className="divide-y divide-gray-100 text-sm">{(fijos ?? []).map((f) => (
              <li key={f.id} className={`flex items-center justify-between gap-2 py-2 ${f.activo ? "" : "opacity-50"}`}>
                <span className="min-w-0"><span className="font-medium">{f.descripcion}</span>
                  <span className="block text-xs text-texto-2">{f.gasto_categorias?.nombre} · día {f.dia} · {f.moneda === "USD" ? `US$ ${Number(f.importe).toLocaleString("es-AR")}` : pesos(f.importe)}</span></span>
                <form action={activarFijo}><input type="hidden" name="id" value={f.id} /><input type="hidden" name="activo" value={f.activo ? "0" : "1"} />
                  <button className="boton-sec px-2.5 py-1 text-xs">{f.activo ? "Pausar" : "Activar"}</button></form>
              </li>
            ))}</ul>
            <CargarFijo key={dolar} categorias={categorias ?? []} dolar={dolar} />
          </section>
        </div>
      </div>
    </div>
  );
}
