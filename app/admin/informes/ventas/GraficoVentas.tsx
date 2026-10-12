// Ventas por día (o por mes, si el período es largo): una sola serie, barras finas ancladas
// a la base, y el detalle de cada barra al pasar el mouse o tocarla. Sin librerías.
import { pesos } from "@/lib/formato";

export type Punto = { clave: string; etiqueta: string; total: number; ventas: number; unidades: number };

export default function GraficoVentas({ puntos, titulo }: { puntos: Punto[]; titulo: string }) {
  const maximo = Math.max(0, ...puntos.map((p) => p.total));
  // Etiquetas del eje: la primera, la del medio y la última (no una por barra)
  const marcas = new Set([0, Math.floor((puntos.length - 1) / 2), puntos.length - 1]);

  return (
    <section className="tarjeta">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold">{titulo}</h2>
        {maximo > 0 && <span className="text-xs text-texto-2">máximo {pesos(maximo)}</span>}
      </div>
      {maximo === 0 ? <p className="py-10 text-center text-sm text-texto-2">No hubo ventas en este período.</p> : (
        <>
          <div className="relative h-44 border-b border-gray-300">
            <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-200" />
            <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />
            <div className="relative flex h-full items-end gap-[2px]">
              {puntos.map((p, i) => (
                // Toda la columna es la zona de hover (más grande que la barra)
                <div key={p.clave} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end outline-none">
                  <div className="w-full rounded-t-[4px] bg-marca transition-opacity group-hover:opacity-80 group-focus:opacity-80"
                    style={{ height: `${(p.total / maximo) * 100}%` }} />
                  <div className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden w-max rounded-lg border border-borde bg-white px-2.5 py-1.5 text-xs shadow-md group-hover:block group-focus:block ${i < puntos.length / 2 ? "left-0" : "right-0"}`}>
                    <div className="font-semibold">{p.etiqueta}</div>
                    <div className="tabular-nums">{pesos(p.total)}</div>
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
