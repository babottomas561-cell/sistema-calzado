import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MapPin, Truck } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import ElegirVariante from "./ElegirVariante";
import Galeria from "./Galeria";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data }, { data: medios }, { data: imagenes }, { data: promos }] = await Promise.all([
    supabase.from("v_catalogo").select("*").eq("producto_id", Number(id)).order("talle_orden"),
    // El mayor descuento disponible en la tienda, para mostrarlo junto al precio
    supabase.from("medios_pago").select("id, nombre, ajuste_pct, cuotas").eq("activo", true).eq("en_tienda", true).lt("ajuste_pct", 0).order("ajuste_pct").limit(1),
    // Galería pública (solo productos publicados): la principal primero, después en su orden
    supabase.from("v_imagenes_tienda").select("url, principal, orden").eq("producto_id", Number(id)).order("principal", { ascending: false }).order("orden"),
    supabase.from("v_promos_tienda").select("promocion_id, nombre, etiqueta, mezcla, hasta").eq("producto_id", Number(id)),
  ]);
  if (!data?.length) notFound();
  const p = data[0];
  const fotos = (imagenes ?? []).map((i) => i.url ?? "").filter(Boolean);
  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <nav aria-label="Ubicación" className="flex min-h-11 flex-wrap items-center gap-1 text-sm text-texto-2">
        <Link href="/tienda" className="inline-flex min-h-11 items-center hover:text-marca">Tienda</Link><ChevronRight size={14} />
        {p.categoria && <><Link href={`/tienda?categoria=${encodeURIComponent(p.categoria)}#catalogo`} className="inline-flex min-h-11 items-center hover:text-marca">{p.categoria}</Link><ChevronRight size={14} /></>}
        <span className="font-semibold text-marca">{p.nombre}</span>
      </nav>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-14">
        <Galeria fotos={fotos} nombre={p.nombre ?? ""} />
        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-texto-2">{[p.marca, p.genero].filter(Boolean).join(" · ")}</p>
            <h1 className="text-[clamp(1.7rem,4vw,2.4rem)] font-extrabold leading-[1.05] tracking-[-0.035em]">{p.nombre}</h1>
          </div>
          {(promos ?? []).map((pr) => (
            <div key={pr.promocion_id} className="flex items-start gap-3 rounded-sm bg-acento-suave px-4 py-3 text-sm">
              <span className="rounded-sm bg-acento px-2 py-1 text-xs font-bold leading-none text-white">{pr.etiqueta}</span>
              <span><b>{pr.nombre}</b>{pr.mezcla ? ". Podés combinarlo con otros modelos de la promo." : "."}
                {pr.hasta && <span className="block text-xs text-texto-2">Hasta el {new Date(new Date(pr.hasta).getTime() - 1).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</span>}</span>
            </div>
          ))}
          <ElegirVariante variantes={data as never} mejorMedio={medios?.[0] ?? null} imagen={fotos[0] ?? null} />
          <ul className="space-y-2.5 border-t border-borde pt-5 text-sm text-texto-2">
            <li className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0" /> Retirás en el local sin costo.</li>
            <li className="flex gap-3"><Truck size={18} className="mt-0.5 shrink-0" /> También enviamos a tu domicilio.</li>
          </ul>
          {(p.descripcion || p.temporada || p.material) && (
            <div className="space-y-2 border-t border-borde pt-5 text-[0.95rem]">
              {p.descripcion && <p className="max-w-prose">{p.descripcion}</p>}
              {(p.temporada || p.material) && <p className="text-sm text-texto-2">{[p.material && `Material: ${p.material}`, p.temporada].filter(Boolean).join(" · ")}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
