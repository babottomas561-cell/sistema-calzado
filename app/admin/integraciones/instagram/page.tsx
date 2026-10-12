// Instagram: conectar la cuenta profesional del local para mostrar sus últimas publicaciones en la portada de la tienda.
// Lo ve quien tiene el permiso «Tienda online».
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import Encabezado from "../Encabezado";
import Manual from "../Manual";
import Instagram, { type EstadoInstagram, type Publicacion } from "./Instagram";

export default async function PaginaInstagram() {
  await exigir("tienda.editar");
  const supabase = await crearCliente();
  const [{ data: estado }, { data: posts }, { data: secciones }] = await Promise.all([
    supabase.rpc("estado_instagram"),
    supabase.from("instagram_posts").select("id, tipo, imagen_url, permalink, descripcion, publicado_en, visible").order("publicado_en", { ascending: false }),
    supabase.from("inicio_secciones").select("id, visible").eq("tipo", "instagram"),
  ]);
  const e = estado as unknown as EstadoInstagram;
  return (
    <div className="max-w-4xl space-y-6">
      <Encabezado titulo="Instagram"
        texto="Mostrar las últimas publicaciones de tu Instagram en la portada de la tienda, con un botón para que te sigan. Se conecta con la API oficial de Meta, con tu propia cuenta profesional." />
      <section className="overflow-hidden rounded-xl border border-borde bg-white shadow-sm">
        {e && <Instagram estado={e} publicaciones={(posts ?? []) as Publicacion[]} seccion={(secciones ?? []).length > 0} />}
      </section>
      <Manual nombre="instagram" abierto={!e?.conectado} />
    </div>
  );
}
