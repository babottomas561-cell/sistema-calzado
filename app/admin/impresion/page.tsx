// Impresión: cómo salen los comprobantes (papel, qué llevan, textos) y las plantillas de etiquetas con código de barras. Cada local imprime
// con lo que tiene (una térmica de rollo o una común): acá se ajusta a su impresora. Lo ve quien edita Tablas.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { datosLegales, datosTienda } from "@/lib/tienda";
import { esFormato, type LetraComprobante, type ModoImpresion } from "@/lib/comprobante";
import { leerPlantilla } from "@/lib/etiquetas";
import Ayuda from "@/components/Ayuda";
import ConfigComprobantes, { type PorTipo } from "./ConfigComprobantes";
import PlantillasEtiqueta from "./PlantillasEtiqueta";
import ImpresionPorPersona, { type Persona } from "./ImpresionPorPersona";
import Link from "next/link";
import { ReceiptText, Tags, UsersRound, type LucideIcon } from "lucide-react";

type Seccion = "comprobantes" | "equipo" | "etiquetas";
const SECCIONES: { id: Seccion; titulo: string; detalle: string; icono: LucideIcon }[] = [
  { id: "comprobantes", titulo: "Comprobantes", detalle: "Ticket, A4, contenido, copias y vista previa", icono: ReceiptText },
  { id: "equipo", titulo: "Por persona", detalle: "Excepciones según quién vende o desde qué equipo", icono: UsersRound },
  { id: "etiquetas", titulo: "Etiquetas", detalle: "Medidas, contenido y plantilla que se usa", icono: Tags },
];

export default async function PaginaImpresion({ searchParams }: { searchParams: Promise<{ seccion?: string }> }) {
  await exigir("tablas.editar");
  const { seccion: pedida } = await searchParams;
  const seccion: Seccion = SECCIONES.some((item) => item.id === pedida) ? pedida as Seccion : "comprobantes";
  const supabase = await crearCliente();
  const [{ data: plantillas }, { data: conf }, tienda, legal, { data: equipo }, { data: propias }] = await Promise.all([
    supabase.from("plantillas_etiqueta").select("*").order("orden").order("id"),
    supabase.from("configuracion_impresion").select("*").maybeSingle(),
    datosTienda(),
    datosLegales(),
    supabase.from("perfiles").select("id, nombre, roles(nombre)").eq("rol", "staff").order("nombre"),
    supabase.from("impresion_por_usuario").select("usuario_id, comprobante_formato, modo_impresion, comprobante_copias"),
  ]);
  const suya = new Map((propias ?? []).map((x) => [x.usuario_id, x]));
  const personas: Persona[] = (equipo ?? []).map((e) => ({
    id: e.id, nombre: e.nombre ?? "Sin nombre", rol: (e.roles as unknown as { nombre: string } | null)?.nombre ?? null,
    formato: suya.get(e.id)?.comprobante_formato ?? null, modo: suya.get(e.id)?.modo_impresion ?? null, copias: suya.get(e.id)?.comprobante_copias ?? null,
  }));
  const d = legal.datos;
  return (
    <div className="max-w-5xl space-y-6 print:space-y-0">
      <div className="space-y-1 print:hidden">
        <h1 className="text-2xl font-bold">Impresión</h1>
        <p className="text-sm text-texto-2">Configurá cada tipo de impresión por separado. Los cambios de una sección no modifican las otras.</p>
      </div>

      <nav className="grid gap-2 print:hidden sm:grid-cols-3" aria-label="Formatos de impresión">
        {SECCIONES.map(({ id, titulo, detalle, icono: Icono }) => {
          const activa = id === seccion;
          return <Link key={id} href={`/admin/impresion?seccion=${id}`} aria-current={activa ? "page" : undefined}
            className={`flex items-start gap-3 rounded-xl border p-3 transition ${activa ? "border-marca bg-marca-suave text-marca shadow-sm" : "border-borde bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"}`}>
            <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${activa ? "bg-white" : "bg-gray-100"}`}><Icono size={18} strokeWidth={activa ? 2.2 : 1.8} /></span>
            <span><span className="block text-sm font-bold">{titulo}</span><span className={`mt-0.5 block text-xs leading-snug ${activa ? "text-marca/80" : "text-texto-2"}`}>{detalle}</span></span>
          </Link>;
        })}
      </nav>

      {seccion === "comprobantes" && conf && (
        <ConfigComprobantes porTipo={(conf.por_tipo ?? {}) as PorTipo}
          inicial={{
            formato: esFormato(conf.comprobante_formato) ? conf.comprobante_formato : "ticket80", modo: conf.modo_impresion as ModoImpresion, letra: conf.comprobante_letra as LetraComprobante,
            logo: conf.comprobante_logo, datos_legales: conf.comprobante_datos_legales, qr: conf.comprobante_qr, barras: conf.comprobante_codigo_barras,
            mostrar_cliente: conf.comprobante_mostrar_cliente, mostrar_vendedor: conf.comprobante_mostrar_vendedor, mostrar_marca: conf.comprobante_mostrar_marca,
            encabezado: conf.comprobante_encabezado ?? "", pie: conf.comprobante_pie ?? "", leyenda: conf.comprobante_leyenda, copias: conf.comprobante_copias, configurado: conf.comprobante_configurado,
          }}
          emisor={{ nombre: tienda.nombre, logo_url: tienda.logo_url ?? tienda.icono_url, es_icono: !tienda.logo_url && !!tienda.icono_url, razon_social: d?.razon_social ?? null, cuit: d?.cuit ?? null, condicion_iva: d?.condicion_iva ?? null,
            domicilio: d?.domicilio_legal ?? null, telefono: d?.telefono_contacto ?? null, email: d?.email_contacto ?? null, local: tienda.direccion_retiro }}
          faltanLegales={!d?.razon_social || !d.cuit || !d.domicilio_legal}
        />
      )}
      {seccion === "equipo" && conf && <ImpresionPorPersona personas={personas} tienda={{ formato: esFormato(conf.comprobante_formato) ? conf.comprobante_formato : "ticket80", modo: conf.modo_impresion as ModoImpresion, copias: conf.comprobante_copias }} />}
      {seccion === "etiquetas" && <div className="print:hidden"><PlantillasEtiqueta plantillas={(plantillas ?? []).map((p) => leerPlantilla(p as Record<string, unknown>))} enUso={conf?.etiqueta_plantilla_id ?? null} tienda={tienda.nombre} /></div>}
      <div className="print:hidden"><Ayuda nombre="impresion" /></div>
    </div>
  );
}
