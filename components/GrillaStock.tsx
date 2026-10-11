// Stock de un modelo: un renglón por color y una cajita por talle (en su orden real).
// Las cajitas bajan de renglón solas, así entra en el celular sin deslizar de costado.

export type CeldaStock = {
  talle: string; talle_orden: number | null; color: string; color_hex: string | null;
  stock: number; reservado: number; disponible: number; stock_minimo: number;
};

// Verde: hay stock · Amarillo: en el mínimo o por debajo · Rojo: nada para vender
const tono = (v: CeldaStock) =>
  v.disponible <= 0 ? "border-red-200 bg-red-50 text-error"
  : v.disponible <= v.stock_minimo ? "border-amber-200 bg-amber-50 text-alerta"
  : "border-green-200 bg-green-50 text-ok";

export default function GrillaStock({ variantes }: { variantes: CeldaStock[] }) {
  const colores = [...new Map(variantes.map((v) => [v.color, v.color_hex])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="space-y-3">
      {colores.map(([color, hex]) => {
        const delColor = variantes.filter((v) => v.color === color).sort((a, b) => Number(a.talle_orden) - Number(b.talle_orden));
        return (
          <div key={color}>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <span className="h-3 w-3 rounded-full border border-gray-300" style={{ background: hex ?? "transparent" }} />
              {color}<span className="text-xs font-normal text-texto-2">{delColor.reduce((s, v) => s + v.stock, 0)} pares</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {delColor.map((v) => (
                <div key={v.talle} className={`w-12 rounded-lg border py-1 text-center ${tono(v)}`}
                  title={v.reservado ? `${v.reservado} reservado(s) en pedidos` : undefined}>
                  <div className="text-[11px] leading-none opacity-75">{v.talle}</div>
                  <div className="text-base font-bold leading-tight">{v.stock}</div>
                  {v.reservado > 0 && <div className="text-[10px] font-semibold leading-none">{v.reservado}R</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LeyendaStock() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-2">
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-green-200" /> hay stock</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-200" /> en el mínimo</span>
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-red-200" /> sin stock</span>
      <span>· 2R = 2 pares reservados en pedidos</span>
    </p>
  );
}
