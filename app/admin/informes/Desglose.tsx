// Un informe abierto por algo (rubro, marca, modelo…): una fila por grupo con una barra que
// muestra su parte del total. En la compu es una tabla; en el celular, filas apiladas con la
// barra, el valor principal a la derecha y el resto en una línea de detalle.
import Link from "next/link";

export type FilaDesglose = {
  clave: string;
  etiqueta: React.ReactNode;
  principal: number;           // lo que mide la barra (y lo que se muestra a la derecha en el celular)
  principalTexto: string;
  celdas: React.ReactNode[];   // una por columna (la tabla de la compu)
  detalle: string;             // resumen de las otras columnas (el celular)
};

export function Agrupar({ base, opciones, actual, extra = "" }: { base: string; opciones: Record<string, string>; actual: string; extra?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-sm text-texto-2">Abrir por</span>
      {Object.entries(opciones).map(([k, t]) => (
        <Link key={k} href={`${base}?por=${k}${extra}`} className={`rounded-full border px-3 py-1 text-sm ${k === actual ? "border-marca bg-marca text-white" : "border-borde bg-white hover:border-marca"}`}>{t}</Link>
      ))}
    </div>
  );
}

export default function Desglose({ titulo, columnas, filas, total, acciones }: {
  titulo: string; columnas: string[]; filas: FilaDesglose[]; total: number; acciones?: React.ReactNode;
}) {
  const parte = (v: number) => (total > 0 ? Math.max(0, v / total) : 0);
  const pct = (v: number) => `${Math.round(parte(v) * 1000) / 10} %`.replace(".", ",");
  // La barra se dibuja contra el grupo más grande (no contra el 100 %), así se distinguen los chicos
  const mayor = Math.max(0, ...filas.map((f) => f.principal));
  const ancho = (v: number) => `${mayor > 0 ? Math.max(0, (v / mayor) * 100) : 0}%`;

  return (
    <section className="tarjeta p-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="font-semibold">{titulo} <span className="text-sm font-normal text-texto-2">({filas.length})</span></h2>
        {acciones}
      </div>

      {/* Celular */}
      <ul className="divide-y divide-gray-100 border-t border-gray-100 md:hidden">
        {filas.map((f) => (
          <li key={f.clave} className="px-4 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{f.etiqueta}</span>
              <span className="shrink-0 text-sm font-bold">{f.principalTexto}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-marca" style={{ width: ancho(f.principal) }} /></div>
              <span className="w-12 shrink-0 text-right text-[11px] text-texto-2">{pct(f.principal)}</span>
            </div>
            <div className="mt-0.5 text-xs text-texto-2">{f.detalle}</div>
          </li>
        ))}
      </ul>

      {/* Compu */}
      <div className="hidden overflow-x-auto border-t border-gray-100 md:block">
        <table className="tabla">
          <thead><tr>{columnas.map((c, i) => <th key={c} className={i === 0 ? "" : "text-right"}>{c}</th>)}<th className="w-48">Parte del total</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className="hover:bg-gray-50">
                <td className="font-medium">{f.etiqueta}</td>
                {f.celdas.map((c, i) => <td key={i} className="text-right tabular-nums">{c}</td>)}
                <td>
                  <div className="flex items-center gap-2" title={pct(f.principal)}>
                    <div className="h-2 flex-1 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-marca" style={{ width: ancho(f.principal) }} /></div>
                    <span className="w-12 text-right text-xs tabular-nums text-texto-2">{pct(f.principal)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filas.length === 0 && <p className="border-t border-gray-100 py-8 text-center text-sm text-texto-2">Nada para mostrar.</p>}
    </section>
  );
}
