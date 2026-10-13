"use client";
// Ventas por día (o por mes): permite cambiar la medida y comparar visualmente con el período anterior.
import { numero, pesos } from "@/lib/formato";
import { useState } from "react";

export type Punto = { clave: string; etiqueta: string; total: number; ventas: number; unidades: number; ganancia: number };
type Metrica = "total" | "ventas" | "unidades" | "ticket" | "ganancia";

export default function GraficoVentas({ puntos, anteriores, titulo, conCostos }: { puntos: Punto[]; anteriores: Punto[]; titulo: string; conCostos: boolean }) {
  const [metrica, setMetrica] = useState<Metrica>("total");
  const metricas: { clave: Metrica; texto: string }[] = [
    { clave: "total", texto: "Vendido" }, { clave: "ventas", texto: "Ventas" }, { clave: "unidades", texto: "Unidades" },
    { clave: "ticket", texto: "Ticket promedio" }, ...(conCostos ? [{ clave: "ganancia" as const, texto: "Ganancia" }] : []),
  ];
  const valor = (p: Punto) => metrica === "ticket" ? (p.ventas ? p.total / p.ventas : 0) : p[metrica];
  const formato = (v: number) => metrica === "total" || metrica === "ticket" || metrica === "ganancia" ? pesos(v) : numero(v);
  const maximo = Math.max(0, ...puntos.map(valor), ...anteriores.map(valor));
  // Etiquetas del eje: la primera, la del medio y la última (no una por barra)
  const marcas = new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1]);

  return (
    <section className="tarjeta">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">{titulo}</h2><p className="text-xs text-texto-2"><span className="font-semibold text-marca">Actual</span> · <span className="font-semibold text-gray-400">período anterior</span></p></div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Dato del gráfico">
          {metricas.map((m) => <button key={m.clave} type="button" onClick={() => setMetrica(m.clave)} aria-pressed={metrica === m.clave} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${metrica === m.clave ? "border-marca bg-marca-suave text-marca" : "border-borde bg-white text-gray-600 hover:bg-gray-50"}`}>{m.texto}</button>)}
        </div>
      </div>
      {maximo === 0 ? <p className="py-10 text-center text-sm text-texto-2">No hubo ventas en este período.</p> : (
        <>
          <div className="relative h-44 border-b border-gray-300">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-200" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />
            <div className="relative flex h-full items-end gap-[3px]">
              {puntos.map((p, i) => (
                // Toda la columna es la zona de hover (más grande que la barra)
                <div key={p.clave} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-px outline-none">
                  <div className="w-1/2 max-w-4 rounded-t-[3px] bg-gray-300 transition-opacity group-hover:opacity-80 group-focus:opacity-80" style={{ height: `${(valor(anteriores[i] ?? { total: 0, ventas: 0, unidades: 0, ganancia: 0, clave: "", etiqueta: "" }) / maximo) * 100}%` }} />
                  <div className="w-1/2 max-w-4 rounded-t-[3px] bg-marca transition-opacity group-hover:opacity-80 group-focus:opacity-80" style={{ height: `${(valor(p) / maximo) * 100}%` }} />
                  <div className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-lg border border-borde bg-white px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus:block ${i < puntos.length / 2 ? "left-0" : "right-0"}`}>
                    <div className="font-semibold">{p.etiqueta}</div>
                    <div className="tabular-nums"><span className="text-texto-2">Anterior:</span> {formato(valor(anteriores[i] ?? { total: 0, ventas: 0, unidades: 0, ganancia: 0, clave: "", etiqueta: "" }))}</div>
                    <div className="font-semibold tabular-nums"><span className="text-marca">Actual:</span> {formato(valor(p))}</div>
                    <div className="text-texto-2">{p.ventas} venta{p.ventas === 1 ? "" : "s"} · {p.unidades} unidades</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex gap-[2px] text-[11px] text-texto-2">
            {puntos.map((p, i) => (
              <div key={p.clave} className="relative min-w-0 flex-1">
                {marcas.has(i) && <span className={`absolute whitespace-nowrap ${i === 0 ? "left-0" : i === puntos.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2"}`}>{p.etiqueta}</span>}
              </div>
            ))}
          </div>
          <div className="h-4" />
        </>
      )}
    </section>
  );
}
