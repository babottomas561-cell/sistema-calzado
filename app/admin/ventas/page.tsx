// Ventas: lo vendido en un período, con sus totales por medio de pago y su factura de ARCA. Es también la pantalla de facturas: se filtra por con o sin
// factura, se regularizan las que salieron sin factura (en tanda) y se baja el libro IVA ventas para el contador. Quien no ve todas las ventas ve las suyas.
import Link from "next/link";
import { Plus } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { pesos } from "@/lib/formato";
import VentasLista, { type FilaVenta } from "./VentasLista";
import LibroIva, { type FilaIva } from "./LibroIva";

const hoyAR = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const dia = (base: string, mas: number) => { const d = new Date(`${base}T12:00:00-03:00`); d.setUTCDate(d.getUTCDate() + mas); return d.toISOString().slice(0, 10); };
const fechaValida = (x: string | undefined) => (x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : null);

// Los períodos de siempre; «fechas» usa desde/hasta
function rango(periodo: string, desde: string | null, hasta: string | null): [string, string] {
  const h = hoyAR();
  switch (periodo) {
    case "hoy": return [h, h];
    case "ayer": return [dia(h, -1), dia(h, -1)];
    case "semana": { const n = (new Date(`${h}T12:00:00-03:00`).getUTCDay() + 6) % 7; return [dia(h, -n), h]; }
    case "mes_pasado": { const p = dia(h.slice(0, 8) + "01", -1); return [p.slice(0, 8) + "01", p]; }
    case "fechas": return [desde ?? h.slice(0, 8) + "01", hasta ?? h];
    default: return [h.slice(0, 8) + "01", h];
  }
}
const PERIODOS = { hoy: "Hoy", ayer: "Ayer", semana: "Esta semana", mes: "Este mes", mes_pasado: "Mes pasado", fechas: "Elegir fechas" } as const;
const FACTURA = { todas: "Todas", con: "Con factura", sin: "Sin factura", problemas: "Con problemas" } as const;

export default async function Ventas({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string; mias?: string; factura?: string; q?: string }> }) {
  const { supabase, user, permisos } = await exigir("ventas.registrar", "ventas.ver_todas");
  const s = await searchParams;
  const periodo = (s.periodo && s.periodo in PERIODOS ? s.periodo : "mes") as keyof typeof PERIODOS;
  const [desde, hasta] = rango(periodo, fechaValida(s.desde), fechaValida(s.hasta));
  const verTodas = puede(permisos, "ventas.ver_todas");
  const mias = verTodas && s.mias === "1";
  const { data: fiscal } = await supabase.rpc("facturacion_caja");
  const arca = !!(fiscal as { activa?: boolean } | null)?.activa;
  const filtroFactura = (arca && s.factura && s.factura in FACTURA ? s.factura : "todas") as keyof typeof FACTURA;

  let consulta = supabase.from("ventas").select("id, comprobante, fecha, total, canal, pedido_id, anulada_en, usuario_id, clientes(nombre), vendedor:perfiles!ventas_usuario_id_fkey(nombre), venta_items(cantidad), ajuste_medio_pago, pagos(monto, medios_pago(nombre)), facturas(clase, letra, comprobante, estado)")
    .gte("fecha", `${desde}T00:00:00-03:00`).lt("fecha", `${dia(hasta, 1)}T00:00:00-03:00`).order("fecha", { ascending: false }).limit(1000);
  if (mias && user) consulta = consulta.eq("usuario_id", user.id);
  const [{ data: ventas, error }, { data: iva }] = await Promise.all([
    consulta,
    arca && puede(permisos, "facturas.ver")
      ? supabase.from("facturas").select("clase, letra, punto_venta, numero, fecha, doc_tipo, doc_nro, receptor, neto, iva, detalle_iva, total, cae").eq("estado", "autorizada").gte("fecha", desde).lte("fecha", hasta)
      : Promise.resolve({ data: [] }),
  ]);

  type Pago = { monto: number; medios_pago: { nombre: string } };
  type Fac = { clase: string; letra: string; comprobante: string | null; estado: string };
  const filas: FilaVenta[] = (ventas ?? []).map((v) => {
    const f = (v.facturas as unknown as Fac[]).filter((x) => x.clase === "factura" && x.estado !== "cancelada").at(-1) ?? null;
    return {
      id: v.id, comprobante: v.comprobante ?? "", fecha: v.fecha, total: Number(v.total), canal: v.canal, pedido: !!v.pedido_id, anulada: !!v.anulada_en,
      cliente: (v.clientes as unknown as { nombre: string } | null)?.nombre ?? null, vendedor: (v.vendedor as { nombre: string | null } | null)?.nombre ?? null,
      unidades: (v.venta_items as { cantidad: number }[]).reduce((t, i) => t + i.cantidad, 0),
      medios: [...new Set((v.pagos as unknown as Pago[]).map((p) => p.medios_pago.nombre))].join(" + "),
      factura: f ? { letra: f.letra, comprobante: f.comprobante, estado: f.estado } : null,
    };
  });
  const visibles = filas.filter((v) => filtroFactura === "todas" ? true
    : filtroFactura === "con" ? v.factura?.estado === "autorizada"
    : filtroFactura === "sin" ? !v.anulada && !v.factura
    : !!v.factura && v.factura.estado !== "autorizada");

  // Totales (las anuladas se listan tachadas pero no suman)
  const validas = (ventas ?? []).filter((v) => !v.anulada_en && visibles.some((x) => x.id === v.id));
  const total = validas.reduce((t, v) => t + Number(v.total), 0);
  const porMedio = new Map<string, number>();
  validas.forEach((v) => (v.pagos as unknown as Pago[]).forEach((p) => porMedio.set(p.medios_pago.nombre, (porMedio.get(p.medios_pago.nombre) ?? 0) + Number(p.monto))));
  const sinFactura = filas.filter((v) => !v.anulada && !v.factura).length;
  const conProblemas = filas.filter((v) => v.factura && v.factura.estado !== "autorizada" && v.factura.estado !== "pendiente").length;

  const url = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { periodo, desde: periodo === "fechas" ? desde : null, hasta: periodo === "fechas" ? hasta : null, mias: mias ? "1" : null, factura: filtroFactura === "todas" ? null : filtroFactura, ...cambios };
    Object.entries(base).forEach(([k, v]) => { if (v) p.set(k, v); });
    return `/admin/ventas?${p}`;
  };
  const chip = (activo: boolean) => `shrink-0 rounded-lg border px-3 py-1.5 text-sm ${activo ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white hover:bg-gray-50"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Ventas</h1>
        <Link href="/admin/ventas/nueva" className="boton"><Plus size={16} /> Nueva venta</Link>
      </div>

      <div className="space-y-2">
        <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
          {Object.entries(PERIODOS).map(([k, t]) => <Link key={k} href={url({ periodo: k, desde: null, hasta: null })} className={chip(k === periodo)}>{t}</Link>)}
          {verTodas && <Link href={url({ mias: mias ? null : "1" })} className={`${chip(mias)} md:ml-auto`}>{mias ? "✓ " : ""}Solo las mías</Link>}
        </div>
        {periodo === "fechas" && (
          <form method="get" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="periodo" value="fechas" />{mias && <input type="hidden" name="mias" value="1" />}
            <div><label className="etiqueta" htmlFor="desde">Desde</label><input id="desde" name="desde" type="date" defaultValue={desde} className="campo h-10" /></div>
            <div><label className="etiqueta" htmlFor="hasta">Hasta</label><input id="hasta" name="hasta" type="date" defaultValue={hasta} className="campo h-10" /></div>
            <button className="boton-sec min-h-10">Ver</button>
          </form>
        )}
        {arca && (
          <div className="sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0" aria-label="Factura">
            {Object.entries(FACTURA).map(([k, t]) => (
              <Link key={k} href={url({ factura: k === "todas" ? null : k })} className={chip(k === filtroFactura)}>
                {t}{k === "sin" && sinFactura > 0 ? ` (${sinFactura})` : ""}{k === "problemas" && conProblemas > 0 ? ` (${conProblemas})` : ""}</Link>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-error">{error.message}</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className="tarjeta col-span-2"><div className="etiqueta">Total · {PERIODOS[periodo].toLowerCase()}{mias ? " · mías" : ""}</div>
          <div className="text-2xl font-bold">{pesos(total)}</div>
          <div className="text-xs text-texto-2">{validas.length} ventas{validas.length ? ` · promedio ${pesos(total / validas.length)}` : ""}</div></div>
        {[...porMedio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, v]) => (
          <div key={m} className="tarjeta"><div className="etiqueta">{m}</div><div className="font-bold">{pesos(v)}</div></div>
        ))}
      </div>
      {arca && (iva ?? []).length > 0 && <LibroIva filas={(iva ?? []) as FilaIva[]} desde={desde} hasta={hasta} />}

      <VentasLista filas={visibles} seleccionar={arca && filtroFactura === "sin" && puede(permisos, "facturas.emitir") && verTodas} arca={arca} />
    </div>
  );
}
