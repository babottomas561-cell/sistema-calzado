// Ventas de los últimos 14 días, en barras (CSS, sin librerías): cada barra dice su día y su importe; hoy va resaltado.
import { pesos } from "@/lib/formato";

export type DiaVentas = { dia: string; total: number };

export default function VentasPorDia({ dias, titulo }: { dias: DiaVentas[]; titulo: string }) {
  const maximo = Math.max(...dias.map((d) => d.total), 1);
  const total = dias.reduce((s, d) => s + d.total, 0);
  const conVentas = dias.filter((d) => d.total > 0).length;
  const corto = (iso: string) => iso.slice(8, 10);                 // el día del mes
  return (
    <section className="tarjeta space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-xs text-texto-2">{pesos(total)} en {dias.length} días{conVentas ? ` · promedio ${pesos(total / Math.max(conVentas, 1))} por día con ventas` : ""}</p>
      </div>
      <div className="flex h-36 items-end gap-1" role="img" aria-label={`${titulo}: ${pesos(total)} en ${dias.length} días`}>
        {dias.map((d, i) => {
          const esHoy = i === dias.length - 1;
          const alto = d.total > 0 ? Math.max((d.total / maximo) * 100, 4) : 0;
          return (
            <div key={d.dia} className="group relative flex h-full flex-1 flex-col justify-end" title={`${d.dia.split("-").reverse().join("/")}: ${pesos(d.total)}`}>
              <div className={`w-full rounded-t ${esHoy ? "bg-marca" : "bg-marca/35 group-hover:bg-marca/60"}`} style={{ height: `${alto}%` }} />
              {d.total === 0 && <div className="h-px w-full bg-borde" />}
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[10px] tabular-nums text-texto-2">{dias.map((d) => <span key={d.dia} className="flex-1 text-center">{corto(d.dia)}</span>)}</div>
    </section>
  );
}
