// Imprimir y mandar el comprobante de una venta, un presupuesto o una devolución. La base arma el comprobante (sin costos ni notas internas)
// y controla quién lo puede ver; acá se elige el papel y se manda por WhatsApp, mail o link.
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CircleAlert, CircleCheck, Clock, Plus } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { crearCliente } from "@/lib/supabase/server";
import { esFactura, esTipo, leerComprobante, numeroDe, tituloDe, totalDe, type TipoComprobante } from "@/lib/comprobante";
import { pesos } from "@/lib/formato";
import EnviarComprobante, { type Envio } from "./EnviarComprobante";
import VistaComprobante from "./VistaComprobante";

const VOLVER: Record<TipoComprobante, { href: (id: number) => string; texto: string }> = {
  venta: { href: (id) => `/admin/ventas/${id}`, texto: "Venta" },
  presupuesto: { href: (id) => `/admin/presupuestos/${id}`, texto: "Presupuesto" },
  devolucion: { href: (id) => `/admin/devoluciones/${id}`, texto: "Devolución" },
};
type Contacto = { telefono: string | null; email: string | null } | null;

// Teléfono y mail del cliente para dejarlos escritos (no viajan en el comprobante, que también lo ve quien recibe el link)
async function contactoDe(tipo: TipoComprobante, id: number): Promise<Contacto> {
  const supabase = await crearCliente();
  const campos = "clientes(telefono, email)";
  const { data } = tipo === "venta" ? await supabase.from("ventas").select(campos).eq("id", id).maybeSingle()
    : tipo === "presupuesto" ? await supabase.from("presupuestos").select(campos).eq("id", id).maybeSingle()
    : await supabase.from("devoluciones").select(campos).eq("id", id).maybeSingle();
  return (data?.clientes as unknown as Contacto) ?? null;
}

export default async function PaginaComprobante({ params, searchParams }: {
  params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ imprimir?: string; nueva?: string; vuelto?: string; factura?: string; factura_error?: string }>;
}) {
  const { permisos } = await exigir("ventas.registrar", "ventas.ver_todas", "clientes.ver");
  const [{ tipo, id: idTexto }, { imprimir, nueva, vuelto, factura, factura_error }] = await Promise.all([params, searchParams]);
  const id = Number(idTexto);
  if (!esTipo(tipo) || !Number.isInteger(id) || id <= 0) notFound();

  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("comprobante_de", { p_tipo: tipo, p_id: id });
  const c = error ? null : leerComprobante(data);
  if (!c) notFound();

  const [contacto, { data: mail }, { data: envios }, cabeceras, { data: fiscal }] = await Promise.all([
    contactoDe(tipo, id),
    supabase.rpc("comprobante_mail_disponible"),
    supabase.from("comprobante_envios").select("canal, destino, estado, detalle, creado_en").eq("tipo", tipo).eq("documento_id", id).order("creado_en", { ascending: false }).limit(6),
    headers(),
    supabase.rpc("facturacion_caja"),
  ]);
  const facturaActiva = !!(fiscal as { activa?: boolean } | null)?.activa;
  // La dirección de este sitio, por si la instalación todavía no tiene cargada la suya
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  const origen = host ? `${cabeceras.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const url = c.enlace?.url ?? (c.enlace?.ruta ? `${origen}${c.enlace.ruta}` : null);
  const volver = VOLVER[tipo];

  return (
    <div className="mx-auto max-w-5xl space-y-4 print:max-w-none print:space-y-0">
      {nueva && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-green-200 bg-green-50 p-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ok text-white"><CircleCheck size={24} strokeWidth={2} /></span>
            <div><p className="font-semibold text-ok">Venta registrada</p><p className="text-sm text-gray-700">Cobrado <b className="tabular-nums">{pesos(totalDe(c))}</b>. El stock ya se descontó.</p>
              {esFactura(c) && <p className="text-sm font-semibold text-ok">Con Factura {c.fiscal!.letra} <span className="font-mono">{c.fiscal!.comprobante}</span> · CAE {c.fiscal!.cae}</p>}
              {facturaActiva && !c.fiscal && !factura_error && <p className="text-sm text-gray-700">Sin factura (comprobante interno). Si la pide, se hace desde <Link href={`/admin/ventas/${id}`} className="font-semibold underline">la venta</Link>.</p>}</div>
          </div>
          {Number(vuelto) > 0 && <div className="rounded-lg bg-white px-4 py-2 ring-1 ring-green-200"><p className="text-xs font-semibold text-texto-2">Vuelto a entregar</p><p className="text-2xl font-bold tabular-nums text-ok">{pesos(Number(vuelto))}</p></div>}
          <Link href="/admin/ventas/nueva" className="boton ml-auto min-h-12 px-6 text-base"><Plus size={18} /> Nueva venta</Link>
        </div>
      )}
      {/* La factura no salió en el momento: la venta está guardada igual */}
      {factura_error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-error print:hidden"><CircleAlert size={17} className="mt-0.5 shrink-0" />
        <span><b>La venta se guardó, pero no se pudo facturar:</b> {factura_error} <Link href={`/admin/ventas/${id}`} className="font-semibold underline">Facturar desde la venta</Link></span></p>}
      {(factura === "error" || factura === "pendiente") && <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-alerta print:hidden"><Clock size={17} className="mt-0.5 shrink-0" />
        <span><b>ARCA no contestó a tiempo.</b> La factura quedó en la cola y se manda sola en unos minutos; mientras tanto el comprobante dice «Factura en trámite».</span></p>}
      {factura === "rechazada" && <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-error print:hidden"><CircleAlert size={17} className="mt-0.5 shrink-0" />
        <span><b>ARCA rechazó la factura.</b> Mirá el motivo en <Link href={`/admin/ventas/${id}`} className="font-semibold underline">la venta</Link>, corregí el dato y reintentá.</span></p>}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Volver href={volver.href(id)}>{volver.texto}</Volver>
        {tipo === "venta" && !nueva && <Link href="/admin/ventas/nueva" className="boton-sec"><Plus size={16} /> Otra venta</Link>}
      </div>
      <h1 className="text-xl font-bold print:hidden">{tituloDe(c)} <span className="font-mono">{numeroDe(c)}</span></h1>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_23rem] md:items-start print:block">
        <div className="space-y-4 md:order-2 print:hidden">
          <EnviarComprobante c={c} tipo={tipo} id={id} origen={origen} telefono={contacto?.telefono ?? null} email={contacto?.email ?? null}
            mail={(mail as { disponible: boolean; motivo?: string } | null) ?? { disponible: false, motivo: "No se pudo saber si el mail está conectado." }} envios={(envios ?? []) as Envio[]} />
        </div>
        <div className="min-w-0 md:order-1">
          <VistaComprobante c={c} url={url} autoImprimir={imprimir === "1"} puedeConfigurar={puede(permisos, "tablas.editar")} />
        </div>
      </div>
    </div>
  );
}
