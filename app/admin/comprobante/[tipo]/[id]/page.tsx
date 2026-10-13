// Imprimir y mandar el comprobante de una venta, un presupuesto o una devolución. La base arma el comprobante (sin costos ni notas internas)
// y controla quién lo puede ver; acá se elige el papel y se manda por WhatsApp, mail o link.
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { CircleCheck, Plus } from "lucide-react";
import Volver from "@/components/Volver";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { crearCliente } from "@/lib/supabase/server";
import { esTipo, leerComprobante, type TipoComprobante } from "@/lib/comprobante";
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
  params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ imprimir?: string; nueva?: string }>;
}) {
  const { permisos } = await exigir("ventas.registrar", "ventas.ver_todas", "clientes.ver");
  const [{ tipo, id: idTexto }, { imprimir, nueva }] = await Promise.all([params, searchParams]);
  const id = Number(idTexto);
  if (!esTipo(tipo) || !Number.isInteger(id) || id <= 0) notFound();

  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("comprobante_de", { p_tipo: tipo, p_id: id });
  const c = error ? null : leerComprobante(data);
  if (!c) notFound();

  const [contacto, { data: mail }, { data: envios }, cabeceras] = await Promise.all([
    contactoDe(tipo, id),
    supabase.rpc("comprobante_mail_disponible"),
    supabase.from("comprobante_envios").select("canal, destino, estado, detalle, creado_en").eq("tipo", tipo).eq("documento_id", id).order("creado_en", { ascending: false }).limit(6),
    headers(),
  ]);
  // La dirección de este sitio, por si la instalación todavía no tiene cargada la suya
  const host = cabeceras.get("x-forwarded-host") ?? cabeceras.get("host");
  const origen = host ? `${cabeceras.get("x-forwarded-proto") ?? "https"}://${host}` : "";
  const url = c.enlace?.url ?? (c.enlace?.ruta ? `${origen}${c.enlace.ruta}` : null);
  const volver = VOLVER[tipo];

  return (
    <div className="mx-auto max-w-5xl space-y-4 print:max-w-none print:space-y-0">
      {nueva && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok print:hidden"><CircleCheck size={18} /> Venta registrada. El stock ya se descontó.</div>}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Volver href={volver.href(id)}>{volver.texto}</Volver>
        {tipo === "venta" && <Link href="/admin/ventas/nueva" className="boton-sec"><Plus size={16} /> Otra venta</Link>}
      </div>
      <h1 className="text-xl font-bold print:hidden">{c.titulo} <span className="font-mono">{c.numero}</span></h1>

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
