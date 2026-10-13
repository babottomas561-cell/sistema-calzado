// Impresión: cómo salen los comprobantes (papel, qué llevan, textos) y las plantillas de etiquetas con código de barras. Cada local imprime
// con lo que tiene (una térmica de rollo o una común): acá se ajusta a su impresora. Lo ve quien edita Tablas.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { datosLegales, datosTienda } from "@/lib/tienda";
import { esFormato, type LetraComprobante, type ModoImpresion } from "@/lib/comprobante";
import { leerPlantilla } from "@/lib/etiquetas";
import Ayuda from "@/components/Ayuda";
import ConfigComprobantes from "./ConfigComprobantes";
import PlantillasEtiqueta from "./PlantillasEtiqueta";

export default async function PaginaImpresion() {
  await exigir("tablas.editar");
  const supabase = await crearCliente();
  const [{ data: plantillas }, { data: conf }, tienda, legal] = await Promise.all([
    supabase.from("plantillas_etiqueta").select("*").order("orden").order("id"),
    supabase.from("configuracion_impresion").select("*").maybeSingle(),
    datosTienda(),
    datosLegales(),
  ]);
  const d = legal.datos;
  return (
    <div className="max-w-5xl space-y-8 print:space-y-0">
      <div className="space-y-1 print:hidden">
        <h1 className="text-2xl font-bold">Impresión</h1>
        <p className="text-sm text-texto-2">Cómo salen los comprobantes y las etiquetas con código de barras. Cada local imprime con lo que tiene (una impresora térmica de rollo o una común): elegí o ajustá lo que le corresponde.</p>
      </div>
      {conf && (
        <ConfigComprobantes
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
      <div className="print:hidden"><PlantillasEtiqueta plantillas={(plantillas ?? []).map((p) => leerPlantilla(p as Record<string, unknown>))} enUso={conf?.etiqueta_plantilla_id ?? null} tienda={tienda.nombre} /></div>
      <div className="print:hidden"><Ayuda nombre="impresion" /></div>
    </div>
  );
}
