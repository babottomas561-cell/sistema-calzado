// Elegir el período de un informe: atajos (hoy, 7 días, este mes…) o un rango de fechas.
// Todo va en la dirección (?periodo=…&desde=…&hasta=…), así un informe se puede guardar o compartir.
import Link from "next/link";
import { PERIODOS, type Periodo, type Rango } from "@/lib/informes";

export default function SelectorPeriodo({ base, periodo, rango, extra = "" }: { base: string; periodo: Periodo; rango: Rango; extra?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(PERIODOS) as Periodo[]).filter((k) => k !== "rango").map((k) => (
          <Link key={k} href={`${base}?periodo=${k}${extra}`}
            className={`rounded-lg border px-3 py-1.5 text-sm ${k === periodo ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{PERIODOS[k]}</Link>
        ))}
      </div>
      <form action={base} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="periodo" value="rango" />
        {extra.split("&").filter(Boolean).map((par) => { const [k, v] = par.split("="); return <input key={k} type="hidden" name={k} value={decodeURIComponent(v)} />; })}
        <label className="text-xs text-texto-2">Desde<input type="date" name="desde" defaultValue={rango.desde} className={`campo mt-0.5 py-1.5 ${periodo === "rango" ? "border-marca" : ""}`} /></label>
        <label className="text-xs text-texto-2">Hasta<input type="date" name="hasta" defaultValue={rango.hasta} className={`campo mt-0.5 py-1.5 ${periodo === "rango" ? "border-marca" : ""}`} /></label>
        <button className="boton-sec py-2">Ver</button>
      </form>
    </div>
  );
}
