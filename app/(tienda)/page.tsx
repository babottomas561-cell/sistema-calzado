// Catálogo de la tienda: portada con una prenda destacada, categorías, filtros y la grilla de productos.
import Link from "next/link";
import { ArrowRight, Check, SlidersHorizontal } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { pesos } from "@/lib/formato";
import { ESCALAS, FILTRO_ESCALA } from "@/lib/escalas";
import { datosTienda } from "@/lib/tienda";
import TarjetaProducto, { type Modelo } from "./TarjetaProducto";

type Fila = { variante_id: number; producto_id: number; nombre: string; marca: string | null; categoria: string | null; genero: string | null; escala: string;
  imagen_url: string | null; talle: string; talle_orden: number; color: string; color_hex: string | null; precio: number; disponible: number; temporada: string | null; material: string | null };
type Filtros = { categoria?: string; genero?: string; talle?: string; escala?: string; q?: string; orden?: string; mas?: string };

const POR_PAGINA = 24;
const ORDENES = [["nuevo", "Destacados"], ["menor", "Menor precio"], ["mayor", "Mayor precio"]] as const;

export default async function Catalogo({ searchParams }: { searchParams: Promise<Filtros> }) {
  const filtros = await searchParams;
  const supabase = await crearCliente();
  const [{ data }, { data: promos }, tienda] = await Promise.all([
    supabase.from("v_catalogo").select("*"),
    supabase.from("v_promos_tienda").select("producto_id, etiqueta"),
    datosTienda(),
  ]);
  const etiquetas = new Map((promos ?? []).map((p) => [p.producto_id, p.etiqueta]));
  const filas = (data ?? []) as Fila[];

  // Opciones de filtro (de lo que hay publicado)
  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) => a!.localeCompare(b!)) as string[];
  const generos = ["Mujer", "Hombre", "Unisex"].filter((g) => filas.some((f) => f.genero === g));
  // Talles por escala: el 34 de niños y el de adulto son talles distintos, cada uno en su fila
  const tallesPorEscala = ESCALAS.map((e) => ({ escala: e, talles: [...new Map(filas.filter((f) => f.disponible > 0 && f.escala === e)
    .map((f) => [f.talle, f.talle_orden])).entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t) })).filter((x) => x.talles.length);

  // Agrupar por modelo
  const modelos = new Map<number, Modelo & { genero: string | null; escala: string; talleSet: Set<string> }>();
  for (const f of filas) {
    const m = modelos.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, categoria: f.categoria, genero: f.genero, escala: f.escala, imagen: f.imagen_url,
      imagen2: null, precio: Number(f.precio), colores: [], disponible: 0, etiqueta: etiquetas.get(f.producto_id) ?? null, talleSet: new Set<string>() };
    m.precio = Math.min(m.precio, Number(f.precio));
    // En la tarjeta solo se muestran los colores que hay para vender
    if (f.disponible > 0) { if (!m.colores.some((c) => c.nombre === f.color)) m.colores.push({ nombre: f.color, hex: f.color_hex }); m.talleSet.add(f.talle); }
    m.disponible += f.disponible;
    modelos.set(f.producto_id, m);
  }
  const q = (filtros.q ?? "").toLowerCase().trim();
  let lista = [...modelos.values()].filter((m) =>
    (!filtros.categoria || m.categoria === filtros.categoria) && (!filtros.genero || m.genero === filtros.genero) &&
    (!filtros.talle || (m.talleSet.has(filtros.talle) && m.escala === (filtros.escala ?? "Adulto"))) &&
    (!q || m.nombre.toLowerCase().includes(q) || (m.marca ?? "").toLowerCase().includes(q) || (m.categoria ?? "").toLowerCase().includes(q)));
  // Lo que se puede comprar primero; después, el orden pedido (por defecto, una mezcla estable de destacados)
  const orden = filtros.orden === "menor" || filtros.orden === "mayor" ? filtros.orden : "nuevo";
  lista = lista.sort((a, b) => Number(b.disponible > 0) - Number(a.disponible > 0)
    || (orden === "menor" ? a.precio - b.precio : orden === "mayor" ? b.precio - a.precio : (a.id * 37) % 101 - (b.id * 37) % 101));   // mezcla estable: que no queden juntas las prendas de una misma marca

  const limite = filtros.mas ? Number(filtros.mas) || POR_PAGINA : POR_PAGINA;
  const visibles = lista.slice(0, limite);

  // Segunda foto de cada tarjeta (se ve al pasar el mouse): solo de las que se muestran
  if (visibles.length) {
    const { data: fotos } = await supabase.from("v_imagenes_tienda").select("producto_id, url, principal, orden")
      .in("producto_id", visibles.map((m) => m.id)).eq("principal", false).order("orden");
    const segunda = new Map<number, string>();
    (fotos ?? []).forEach((f) => { if (f.producto_id && f.url && !segunda.has(f.producto_id)) segunda.set(f.producto_id, f.url); });
    visibles.forEach((m) => { m.imagen2 = segunda.get(m.id) ?? null; });
  }

  // Prenda destacada de la portada: una con promoción y foto; si no hay, la más nueva con foto
  const destacada = lista.find((m) => m.imagen && m.etiqueta && m.disponible > 0) ?? lista.find((m) => m.imagen && m.disponible > 0) ?? null;

  const hayFiltro = !!(filtros.categoria || filtros.genero || filtros.talle || q);
  const link = (cambio: Partial<Filtros>, mantener = true) => {
    const base = mantener ? { ...filtros, mas: undefined } : {};
    const p = new URLSearchParams(Object.entries({ ...base, ...cambio }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/?${s}#catalogo` : "/#catalogo";
  };

  // Filtros (género, talle y orden): el mismo panel va desplegable en el celular y fijo al costado en la compu
  const panel = (
    <div className="space-y-7 text-sm">
      <div>
        <p className="mb-2.5 font-bold">Ordenar</p>
        <div className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
          {ORDENES.map(([v, t]) => (
            <Link key={v} href={link({ orden: v === "nuevo" ? undefined : v })} aria-current={orden === v ? "true" : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-sm px-3 lg:px-0 ${orden === v ? "bg-marca-suave font-bold lg:bg-transparent" : "border border-borde lg:border-0 lg:text-texto-2 lg:hover:text-marca"}`}>
              {orden === v && <Check size={15} className="hidden lg:block" />}{t}</Link>
          ))}
        </div>
      </div>
      {generos.length > 0 && (
        <div>
          <p className="mb-2.5 font-bold">Para</p>
          <div className="flex flex-wrap gap-2">{generos.map((g) => (
            <Link key={g} href={link({ genero: filtros.genero === g ? undefined : g })} aria-pressed={filtros.genero === g}
              className={`inline-flex min-h-11 items-center rounded-sm border px-4 ${filtros.genero === g ? "border-marca bg-marca text-white" : "border-borde hover:border-marca"}`}>{g}</Link>
          ))}</div>
        </div>
      )}
      {tallesPorEscala.map(({ escala, talles }) => (
        <div key={escala}>
          <p className="mb-2.5 font-bold">{FILTRO_ESCALA[escala] ?? "Talle"}</p>
          <div className="flex flex-wrap gap-2">{talles.map((t) => { const activo = filtros.talle === t && (filtros.escala ?? "Adulto") === escala;
            return <Link key={t} href={link(activo ? { talle: undefined, escala: undefined } : { talle: t, escala: escala === "Adulto" ? undefined : escala })} aria-pressed={activo}
              className={`inline-flex h-11 min-w-11 items-center justify-center rounded-sm border px-2.5 ${activo ? "border-marca bg-marca font-semibold text-white" : "border-borde hover:border-marca"}`}>{t}</Link>; })}
          </div>
        </div>
      ))}
      {hayFiltro && <Link href="/#catalogo" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Quitar todos los filtros</Link>}
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Portada: la prenda manda; el texto sale de Tablas → Tienda */}
      <section className="grid overflow-hidden rounded-sm bg-marca-suave md:grid-cols-[1.05fr_1fr]">
        <div className="order-2 flex flex-col justify-center gap-5 px-6 py-8 sm:px-10 md:order-1 md:py-14">
          <h1 className="max-w-[16ch] text-[clamp(2.2rem,6vw,4.4rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">{tienda.titulo_inicio}</h1>
          <p className="max-w-md text-base text-texto-2 md:text-lg">{tienda.bajada_inicio}</p>
          <div className="flex flex-wrap gap-3">
            <a href="#catalogo" className="boton">Ver el catálogo <ArrowRight size={18} /></a>
            {destacada && <Link href={`/producto/${destacada.id}`} className="boton-sec">{destacada.etiqueta ? `Ver ${destacada.etiqueta}` : "Ver destacado"}</Link>}
          </div>
        </div>
        {destacada?.imagen && (
          <Link href={`/producto/${destacada.id}`} className="group relative order-1 block aspect-square overflow-hidden bg-gray-100 md:order-2 md:aspect-auto md:min-h-[32rem]" aria-label={`${destacada.nombre}, ${pesos(destacada.precio)}`}>
            <img src={destacada.imagen} alt={destacada.nombre} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-700 ease-out group-hover:scale-[1.03] motion-reduce:transition-none" />
            <span className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 rounded-sm bg-white px-4 py-3 text-sm sm:right-auto sm:min-w-64">
              <span><span className="block font-bold leading-tight">{destacada.nombre}</span><span className="text-texto-2">{destacada.marca}</span></span>
              <span className="font-bold">{pesos(destacada.precio)}</span>
            </span>
          </Link>
        )}
      </section>

      <section id="catalogo" className="scroll-mt-20 space-y-5">
        {/* Buscador */}
        <form action="/" className="flex gap-2">
          {Object.entries(filtros).filter(([k, v]) => v && !["q", "mas"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input id="buscar" name="q" defaultValue={filtros.q} placeholder="Buscar remeras, zapatillas, una marca…" className="campo" aria-label="Buscar" />
          <button className="boton px-5">Buscar</button>
        </form>

        {/* Categorías: se deslizan con el dedo */}
        <nav aria-label="Categorías" className="tira -mx-4 flex gap-1 overflow-x-auto border-b border-borde px-4 sm:-mx-6 sm:px-6">
          {[["", "Todo"], ...categorias.map((c) => [c, c])].map(([c, t]) => {
            const activa = (filtros.categoria ?? "") === c;
            return <Link key={t} href={link({ categoria: c || undefined })} aria-current={activa ? "true" : undefined}
              className={`-mb-px inline-flex min-h-12 shrink-0 items-center border-b-2 px-3.5 text-[0.95rem] ${activa ? "border-marca font-bold" : "border-transparent text-texto-2 hover:text-marca"}`}>{t}</Link>;
          })}
        </nav>

        <div className="grid gap-8 lg:grid-cols-[13rem_1fr]">
          {/* Celular: panel desplegable */}
          <details className="group rounded-sm border border-borde lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-bold [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2"><SlidersHorizontal size={18} /> Filtrar y ordenar</span>
              <span className="text-sm font-normal text-texto-2">{lista.length} {lista.length === 1 ? "prenda" : "prendas"}</span>
            </summary>
            <div className="border-t border-borde p-4">{panel}</div>
          </details>
          {/* Compu: panel fijo al costado */}
          <aside className="hidden lg:block"><div className="sticky top-24">{panel}</div></aside>

          <div className="space-y-6">
            <p className="hidden text-sm text-texto-2 lg:block" aria-live="polite">{lista.length} {lista.length === 1 ? "prenda" : "prendas"}{hayFiltro ? " con esos filtros" : ""}</p>
            {lista.length === 0 ? (
              <div className="rounded-sm border border-dashed border-borde px-6 py-14 text-center">
                <p className="text-lg font-bold">No encontramos nada con esos filtros</p>
                <p className="mt-1 text-texto-2">Probá con otra categoría o sacá algún filtro.</p>
                <Link href="/#catalogo" className="boton mt-5">Ver todo</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4">
                {visibles.map((m, i) => <TarjetaProducto key={m.id} m={m} prioridad={i < 4} />)}
              </div>
            )}
            {lista.length > visibles.length && (
              <div className="pt-2 text-center">
                <Link href={link({ mas: String(limite + POR_PAGINA) })} scroll={false} className="boton-sec">Ver más prendas ({lista.length - visibles.length} más)</Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
