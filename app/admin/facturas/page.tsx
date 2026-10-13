// Facturas de ARCA: lo emitido (facturas y notas de crédito) con sus totales y el libro IVA ventas para el contador, y las ventas sin factura para
// regularizarlas en tanda. Lo ve quien ve todas las facturas; facturar en tanda, quien además puede facturar.
import Link from "next/link";
import { FileCheck2, FileClock } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import Facturas, { type FilaFactura } from "./Facturas";
import SinFactura, { type VentaSinFactura } from "./SinFactura";

const hoyAR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const fechaValida = (x: string | undefined, d: string) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : d);

export default async function PaginaFacturas({ searchParams }: { searchParams: Promise<{ t?: string; desde?: string; hasta?: string; estado?: string }> }) {
  const { supabase, permisos } = await exigir("facturas.ver");
  const q = await searchParams;
  const solapa = q.t === "sin" ? "sin" : "emitidas";
  const hoy = hoyAR();
  const desde = fechaValida(q.desde, hoy.slice(0, 8) + "01"), hasta = fechaValida(q.hasta, hoy);
  const estado = ["autorizada", "pendiente", "error", "rechazada", "cancelada"].includes(q.estado ?? "") ? q.estado! : "";
  const { data: fiscal } = await supabase.rpc("facturacion_caja");
  const activa = !!(fiscal as { activa?: boolean } | null)?.activa;

  let facturas: FilaFactura[] = [], sinFactura: VentaSinFactura[] = [];
  if (solapa === "emitidas") {
    let consulta = supabase.from("facturas").select("id, clase, letra, cbte_tipo, punto_venta, numero, comprobante, fecha, receptor, doc_tipo, doc_nro, neto, iva, detalle_iva, total, estado, cae, ultimo_error, venta_id, ambiente")
      .gte("fecha", desde).lte("fecha", hasta).order("fecha", { ascending: false }).order("id", { ascending: false }).limit(2000);
    if (estado) consulta = consulta.eq("estado", estado);
    facturas = ((await consulta).data ?? []) as FilaFactura[];
  } else {
    sinFactura = ((await supabase.rpc("ventas_sin_factura", { p_desde: desde, p_hasta: hasta })).data ?? []) as VentaSinFactura[];
  }

  const pestana = (clave: string, texto: string, Icono: typeof FileCheck2) => (
    <Link href={`/admin/facturas?t=${clave}&desde=${desde}&hasta=${hasta}`} aria-current={solapa === clave ? "page" : undefined}
      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${solapa === clave ? "bg-white text-marca shadow-sm ring-1 ring-borde" : "text-gray-600 hover:bg-white/60"}`}>
      <Icono size={16} strokeWidth={solapa === clave ? 2.2 : 1.8} />{texto}</Link>
  );
  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Facturas</h1>
        <p className="text-sm text-texto-2">Las facturas y notas de crédito de ARCA, el libro IVA ventas para el contador y las ventas que salieron sin factura.</p>
      </div>
      {!activa && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-alerta">La facturación con ARCA no está activa: se configura en <Link href="/admin/integraciones/arca" className="font-semibold underline">Integraciones → ARCA</Link>.</p>}
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 sin-barra md:mx-0 md:px-0">{pestana("emitidas", "Emitidas", FileCheck2)}{pestana("sin", "Ventas sin factura", FileClock)}</nav>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="t" value={solapa} />
        <div><label className="etiqueta" htmlFor="desde">Desde</label><input id="desde" name="desde" type="date" defaultValue={desde} className="campo h-10" /></div>
        <div><label className="etiqueta" htmlFor="hasta">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo h-10" /></div>
        {solapa === "emitidas" && <div><label className="etiqueta" htmlFor="estado">Estado</label>
          <select id="estado" name="estado" defaultValue={estado} className="campo h-10"><option value="">Todos</option><option value="autorizada">Autorizadas</option>
            <option value="pendiente">En la cola</option><option value="error">Con error (se reintentan)</option><option value="rechazada">Rechazadas</option><option value="cancelada">Canceladas</option></select></div>}
        <button className="boton-sec min-h-10">Ver</button>
      </form>
      {solapa === "emitidas" ? <Facturas filas={facturas} desde={desde} hasta={hasta} />
        : <SinFactura ventas={sinFactura} puedeFacturar={activa && puede(permisos, "facturas.emitir")} />}
    </div>
  );
}
