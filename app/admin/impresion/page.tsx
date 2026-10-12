// Impresión: las plantillas de etiquetas (rollo u hoja, tamaño y qué lleva cada una) y cuál se usa. Cada local imprime con lo que tiene:
// acá se ajusta a su impresora. Lo ve quien edita Tablas.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { datosTienda } from "@/lib/tienda";
import { leerPlantilla } from "@/lib/etiquetas";
import Ayuda from "@/components/Ayuda";
import PlantillasEtiqueta from "./PlantillasEtiqueta";

export default async function PaginaImpresion() {
  await exigir("tablas.editar");
  const supabase = await crearCliente();
  const [{ data: plantillas }, { data: conf }, tienda] = await Promise.all([
    supabase.from("plantillas_etiqueta").select("*").order("orden").order("id"),
    supabase.from("configuracion_impresion").select("etiqueta_plantilla_id").maybeSingle(),
    datosTienda(),
  ]);
  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Impresión</h1>
        <p className="text-sm text-texto-2">Cómo salen las etiquetas con código de barras. Cada local imprime con lo que tiene (una impresora térmica de rollo o una común con hojas de etiquetas): elegí o ajustá la plantilla que le corresponde.</p>
      </div>
      <PlantillasEtiqueta plantillas={(plantillas ?? []).map((p) => leerPlantilla(p as Record<string, unknown>))} enUso={conf?.etiqueta_plantilla_id ?? null} tienda={tienda.nombre} />
      <Ayuda nombre="impresion" />
    </div>
  );
}
