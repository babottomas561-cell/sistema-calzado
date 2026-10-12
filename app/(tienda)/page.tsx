// Landing de la tienda: la primera impresión. Se arma con las SECCIONES que el dueño configura en
// /admin/tienda (orden, textos, fotos, qué se muestra); los productos, las promociones y los datos del
// local salen de la base, así que cuando cambia el catálogo, cambia acá solo.
import { crearCliente } from "@/lib/supabase/server";
import { datosTienda } from "@/lib/tienda";
import { leerContenido, type Filtro, type Seccion, type Tipo } from "@/lib/inicio";
import { Accesos, Banner, Cinta, Editorial, Instagram, Local, Pasos, Portada, Promociones, Vidriera, type ModeloInicio } from "./inicio/Secciones";

type Fila = { producto_id: number; nombre: string; marca: string | null; categoria: string | null; genero: string | null; linea: string | null;
  imagen_url: string | null; color: string; color_hex: string | null; precio: number; disponible: number; creado_en: string };

// Mezcla estable: las mismas fotos en cada visita, pero sin agrupar por marca ni por rubro
const mezcla = (id: number) => (id * 37) % 101;
const cumple = (m: ModeloInicio, f: Filtro) => (!f.genero || m.genero === f.genero) && (!f.categoria || m.categoria === f.categoria)
  && (!f.linea || m.linea === f.linea) && (!f.q || `${m.nombre} ${m.marca ?? ""} ${m.categoria ?? ""}`.toLowerCase().includes(f.q.toLowerCase()));

export default async function Landing() {
  const supabase = await crearCliente();
  const [{ data: secciones }, { data }, { data: promos }, { data: contacto }, { data: vendidos }, { data: publicaciones }, tienda] = await Promise.all([
    supabase.from("inicio_secciones").select("id, tipo, orden, visible, titulo, bajada, boton_texto, boton_enlace, imagen_url, imagen_ruta, contenido")
      .eq("visible", true).order("orden").order("id"),
    supabase.from("v_catalogo").select("producto_id, nombre, marca, categoria, genero, linea, imagen_url, color, color_hex, precio, disponible, creado_en"),
    supabase.from("v_promos_tienda").select("producto_id, promocion_id, nombre, etiqueta"),
    supabase.from("configuracion_tienda").select("whatsapp, direccion_retiro, horario, instagram").single(),
    supabase.rpc("mas_vendidos_tienda"),
    // Las últimas publicaciones de Instagram que el local no ocultó (la base las copia sola; sin conexión no hay ninguna)
    supabase.from("instagram_posts").select("id, tipo, imagen_url, permalink, descripcion").order("publicado_en", { ascending: false }).limit(12),
    datosTienda(),
  ]);
  const etiquetas = new Map((promos ?? []).map((p) => [p.producto_id, p.etiqueta]));

  // Un modelo por artículo, con los colores que hay para vender
  const modelos = new Map<number, ModeloInicio>();
  for (const f of (data ?? []) as Fila[]) {
    const m = modelos.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, categoria: f.categoria, genero: f.genero, linea: f.linea,
      imagen: f.imagen_url, imagen2: null, precio: Number(f.precio), colores: [], disponible: 0, etiqueta: etiquetas.get(f.producto_id) ?? null, creado: f.creado_en };
    m.precio = Math.min(m.precio, Number(f.precio));
    if (f.disponible > 0 && !m.colores.some((c) => c.nombre === f.color)) m.colores.push({ nombre: f.color, hex: f.color_hex });
    m.disponible += f.disponible;
    modelos.set(f.producto_id, m);
  }
  // En la portada solo lo que tiene foto y se puede comprar
  const hay = [...modelos.values()].filter((m) => m.imagen && m.disponible > 0).sort((a, b) => mezcla(a.id) - mezcla(b.id));
  const marcas = [...new Set(hay.map((m) => m.marca).filter(Boolean))].sort() as string[];
  const rankingVentas = new Map((vendidos ?? []).map((v, i) => [v.producto_id, i]));

  // Que la misma prenda no se repita en dos secciones seguidas (si alcanza el catálogo)
  const usadas = new Set<number>();
  const elegir = (lista: ModeloInicio[], cuantas: number) => {
    const nuevas = lista.filter((m) => !usadas.has(m.id));
    const r = (nuevas.length >= cuantas ? nuevas : lista).slice(0, cuantas);
    r.forEach((m) => usadas.add(m.id));
    return r;
  };

  const lista = (secciones ?? []).map((s) => ({ ...s, tipo: s.tipo as Tipo, contenido: leerContenido(s.tipo as Tipo, s.contenido) })) as Seccion[];
  const promosUnicas = [...new Map((promos ?? []).map((p) => [p.promocion_id, p.nombre])).values()].filter(Boolean) as string[];

  const bloques = lista.map((s) => {
    switch (s.tipo) {
      case "portada": return <Portada key={s.id} s={s as Seccion<"portada">} fotos={hay.slice(0, 18)} tienda={tienda.nombre} />;
      case "cinta": return <Cinta key={s.id} s={s as Seccion<"cinta">} marcas={marcas} />;
      case "accesos": {
        const sa = s as Seccion<"accesos">;
        const tarjetas = sa.contenido.tarjetas.map((t) => ({ ...t, foto: t.imagen_url || elegir(hay.filter((m) => cumple(m, t.filtro)), 1)[0]?.imagen || null }));
        return <Accesos key={s.id} s={sa} tarjetas={tarjetas} />;
      }
      case "productos": {
        const sp = s as Seccion<"productos">;
        const { criterio, cantidad, productos } = sp.contenido;
        const orden = criterio === "elegidos" ? productos.map((id) => hay.find((m) => m.id === id)).filter(Boolean) as ModeloInicio[]
          : criterio === "promocion" ? hay.filter((m) => m.etiqueta)
          : criterio === "nuevos" ? [...hay].sort((a, b) => b.creado.localeCompare(a.creado))
          : [...hay].sort((a, b) => (rankingVentas.get(a.id) ?? 999) - (rankingVentas.get(b.id) ?? 999));
        return <Vidriera key={s.id} s={sp} modelos={criterio === "elegidos" ? orden.slice(0, cantidad) : elegir(orden, cantidad)} />;
      }
      case "promociones": return <Promociones key={s.id} s={s as Seccion<"promociones">} promos={promosUnicas} />;
      case "banner": return <Banner key={s.id} s={s as Seccion<"banner">} />;
      case "editorial": return <Editorial key={s.id} s={s as Seccion<"editorial">} />;
      case "instagram": { const si = s as Seccion<"instagram">; return <Instagram key={s.id} s={si} posts={(publicaciones ?? []).slice(0, si.contenido.cantidad)} usuario={contacto?.instagram ?? null} />; }
      case "pasos": return <Pasos key={s.id} s={s as Seccion<"pasos">} />;
      case "local": return <Local key={s.id} s={s as Seccion<"local">} contacto={contacto} tienda={tienda.nombre} />;
    }
  });

  return <div className="space-y-24 md:space-y-36">{bloques}</div>;
}
