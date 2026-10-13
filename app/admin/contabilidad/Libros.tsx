// Los libros: diario (asientos con sus renglones), mayor de una cuenta (con saldo corrido) y sumas y saldos. Solo lectura; los filtros van por la dirección.
import Link from "next/link";
import { dia, pesos } from "@/lib/formato";

export type Renglon = { asiento_id: number; numero: number; fecha: string; concepto: string; origen: string; circuito: string; anula_a: number | null; cuenta_codigo: string; cuenta_nombre: string; debe: number; haber: number; detalle: string | null };
export type Mov = { fecha: string; numero: number; concepto: string; origen: string; debe: number; haber: number; saldo: number };
export type Suma = { codigo: string; nombre: string; tipo: string; debe: number; haber: number; saldo_deudor: number; saldo_acreedor: number };
export const ORIGEN: Record<string, string> = { apertura: "Apertura", manual: "Manual", venta: "Venta", anulacion_venta: "Anulación de venta", compra: "Compra", gasto: "Gasto", devolucion: "Devolución", ajuste_stock: "Ajuste de stock", fallado: "Fallado", credito_proveedor: "Crédito de proveedor", recibo: "Recibo", orden_pago: "Orden de pago" };
const monto = (n: number) => (Number(n) ? pesos(n) : "");

export function Filtro({ t, desde, hasta, extra }: { t: string; desde: string; hasta: string; extra?: React.ReactNode }) {
  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="t" value={t} />
      {extra}
      <div><label className="etiqueta" htmlFor="desde">Desde</label><input id="desde" name="desde" type="date" defaultValue={desde} className="campo h-10" /></div>
      <div><label className="etiqueta" htmlFor="hasta">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo h-10" /></div>
      <button className="boton-sec min-h-10">Ver</button>
    </form>
  );
}

export function LibroDiario({ filas }: { filas: Renglon[] }) {
  const asientos = new Map<number, Renglon[]>();
  for (const f of filas) asientos.set(f.asiento_id, [...(asientos.get(f.asiento_id) ?? []), f]);
  if (!asientos.size) return <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">No hay asientos en esas fechas.</p>;
  return (
    <div className="space-y-2">
      {[...asientos.values()].map((lineas) => {
        const a = lineas[0];
        return (
          <article key={a.asiento_id} className="overflow-hidden rounded-xl border border-borde bg-white">
            <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 bg-gray-50 px-4 py-2 text-sm">
              <b className="tabular-nums">N.° {a.numero}</b><span className="tabular-nums text-texto-2">{dia(a.fecha)}</span><span className="min-w-0 flex-1 font-medium">{a.concepto}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-700 ring-1 ring-borde">{ORIGEN[a.origen] ?? a.origen}</span>
              {a.circuito === "interno" && <span className="text-xs text-gray-700">interno</span>}
            </header>
            <table className="w-full text-sm">
              <tbody>
                {lineas.map((l, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="w-24 px-4 py-1.5 font-mono text-xs tabular-nums text-gray-700">{l.cuenta_codigo}</td>
                    <td className={`py-1.5 ${l.haber > 0 ? "pl-8" : ""}`}>{l.cuenta_nombre}{l.detalle && <span className="text-xs text-gray-600"> · {l.detalle}</span>}</td>
                    <td className="w-32 px-2 py-1.5 text-right tabular-nums">{monto(l.debe)}</td><td className="w-32 px-4 py-1.5 text-right tabular-nums">{monto(l.haber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        );
      })}
    </div>
  );
}

export function Mayor({ filas }: { filas: Mov[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-borde bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-borde text-left text-xs text-gray-700"><th className="px-4 py-2">Fecha</th><th>N.°</th><th>Concepto</th><th className="text-right">Debe</th><th className="text-right">Haber</th><th className="px-4 text-right">Saldo</th></tr></thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className="border-t border-gray-100">
              <td className="px-4 py-1.5 tabular-nums">{dia(f.fecha)}</td><td className="tabular-nums">{f.numero || ""}</td>
              <td className="py-1.5">{f.concepto}{f.origen && <span className="text-xs text-gray-600"> · {ORIGEN[f.origen] ?? f.origen}</span>}</td>
              <td className="text-right tabular-nums">{monto(f.debe)}</td><td className="text-right tabular-nums">{monto(f.haber)}</td><td className="px-4 text-right font-semibold tabular-nums">{pesos(f.saldo)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SumasYSaldos({ filas }: { filas: Suma[] }) {
  const t = filas.reduce((s, f) => ({ debe: s.debe + Number(f.debe), haber: s.haber + Number(f.haber), d: s.d + Number(f.saldo_deudor), a: s.a + Number(f.saldo_acreedor) }), { debe: 0, haber: 0, d: 0, a: 0 });
  if (!filas.length) return <p className="rounded-xl border border-dashed border-borde px-4 py-8 text-center text-sm text-texto-2">Todavía no hay movimientos.</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-borde bg-white">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-borde text-left text-xs text-gray-700"><th className="px-4 py-2">Cuenta</th><th className="text-right">Debe</th><th className="text-right">Haber</th><th className="text-right">Saldo deudor</th><th className="px-4 text-right">Saldo acreedor</th></tr></thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.codigo} className="border-t border-gray-100">
              <td className="px-4 py-1.5"><span className="mr-2 font-mono text-xs tabular-nums text-gray-700">{f.codigo}</span>{f.nombre}</td>
              <td className="text-right tabular-nums">{pesos(f.debe)}</td><td className="text-right tabular-nums">{pesos(f.haber)}</td>
              <td className="text-right tabular-nums">{monto(f.saldo_deudor)}</td><td className="px-4 text-right tabular-nums">{monto(f.saldo_acreedor)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t-2 border-borde font-bold"><td className="px-4 py-2">Totales</td><td className="text-right tabular-nums">{pesos(t.debe)}</td><td className="text-right tabular-nums">{pesos(t.haber)}</td><td className="text-right tabular-nums">{pesos(t.d)}</td><td className="px-4 text-right tabular-nums">{pesos(t.a)}</td></tr></tfoot>
      </table>
    </div>
  );
}

export const enlaceMayor = (id: number, desde: string, hasta: string) => `/admin/contabilidad?t=mayor&cuenta=${id}&desde=${desde}&hasta=${hasta}`;
export { Link };
