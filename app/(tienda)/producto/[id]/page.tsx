import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import ElegirVariante from "./ElegirVariante";
import Galeria from "./Galeria";
import Volver from "@/components/Volver";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data }, { data: medios }, { data: imagenes }] = await Promise.all([
    supabase.from("v_catalogo").select("*").eq("producto_id", Number(id)).order("talle_orden"),
    // El mayor descuento disponible en la tienda, para mostrarlo junto al precio
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_tienda", true).lt("ajuste_pct", 0).order("ajuste_pct").limit(1),
    // Galería pública (solo productos publicados): la principal primero, después en su orden
    supabase.from("v_imagenes_tienda").select("url, principal, orden").eq("producto_id", Number(id)).order("principal", { ascending: false }).order("orden"),
  ]);
  if (!data?.length) notFound();
  const p = data[0];
  return (
    <div className="space-y-4">
      <Volver href="/">Volver al catálogo</Volver>
      <div className="grid gap-6 md:grid-cols-2">
        <Galeria fotos={(imagenes ?? []).map((i) => i.url ?? "").filter(Boolean)} nombre={p.nombre ?? ""} />
        <div className="space-y-4">
          <div><div className="text-sm uppercase tracking-wide text-texto-2">{p.marca} · {p.categoria}{p.genero ? ` · ${p.genero}` : ""}</div>
            <h1 className="text-2xl font-bold md:text-3xl">{p.nombre}</h1></div>
          {p.descripcion && <p className="text-gray-700">{p.descripcion}</p>}
          <ElegirVariante variantes={data as never} mejorMedio={medios?.[0] ?? null} />
        </div>
      </div>
    </div>
  );
}
