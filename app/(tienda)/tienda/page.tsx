// La tienda: categorías, filtros (género, talle, color), orden y la grilla de productos.
import Link from "next/link";
import { ChevronDown, X } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { ESCALAS, FILTRO_ESCALA } from "@/lib/escalas";
import TarjetaProducto, { type Modelo } from "../TarjetaProducto";
import FiltrosMovil from "./FiltrosMovil";
import OrdenSelect from "./OrdenSelect";

type Fila = { variante_id: number; producto_id: number; nombre: string; marca: string | null; categoria: string | null; genero: string | null; escala: string; linea: string | null;
  imagen_url: string | null; talle: string; talle_orden: number; color: string; color_hex: string | null; precio: number; disponible: number; creado_en: string };
type Filtros = { categoria?: string; linea?: string; genero?: string; talle?: string; escala?: string; color?: string; q?: string; orden?: string; mas?: string };

const POR_PAGINA = 24;
const ORDENES = [["nuevo", "Destacados"], ["menor", "Menor precio"], ["mayor", "Mayor precio"]] as const;

// Un grupo del panel de filtros: se pliega y se despliega
function Grupo({ titulo, abierto = true, children }: { titulo: string; abierto?: boolean; children: React.ReactNode }) {
  return (
    <details open={abierto} className="group border-b border-borde py-4 first:pt-0 last:border-0">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[0.95rem] font-bold [&::-webkit-details-marker]:hidden">
        {titulo}<ChevronDown size={18} className="transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <div className="pt-2">{children}</div>
    </details>
  );
}

export default async function Tienda({ searchParams }: { searchParams: Promise<Filtros> }) {
  const filtros = await searchParams;
  const supabase = await crearCliente();
  const [{ data }, { data: promos }] = await Promise.all([
    supabase.from("v_catalogo").select("*"),
    supabase.from("v_promos_tienda").select("producto_id, etiqueta"),
  ]);
  const etiquetas = new Map((promos ?? []).map((p) => [p.producto_id, p.etiqueta]));
  const filas = (data ?? []) as Fila[];

  // Opciones de filtro (de lo que hay publicado y se puede comprar)
  const disponibles = filas.filter((f) => f.disponible > 0);
  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))].sort((a, b) => a!.localeCompare(b!)) as string[];
  const generos = ["Mujer", "Hombre", "Unisex"].filter((g) => filas.some((f) => f.genero === g));
  const colores = [...new Map(disponibles.map((f) => [f.color, f.color_hex])).entries()].sort((a, b) => a[0].localeCompare(b[0]));
  // Talles por escala: el 34 de niños y el de adulto son talles distintos, cada uno en su fila
  const tallesPorEscala = ESCALAS.map((e) => ({ escala: e, talles: [...new Map(disponibles.filter((f) => f.escala === e)
    .map((f) => [f.talle, f.talle_orden])).entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t) })).filter((x) => x.talles.length);

  // Agrupar por modelo
  const modelos = new Map<number, Modelo & { genero: string | null; escala: string; linea: string | null; talleSet: Set<string>; ordenTalle: Map<string, number> }>();
  for (const f of filas) {
    const m = modelos.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, categoria: f.categoria, genero: f.genero, escala: f.escala, linea: f.linea, imagen: f.imagen_url,
      imagen2: null, precio: Number(f.precio), colores: [], disponible: 0, etiqueta: etiquetas.get(f.producto_id) ?? null, creado: f.creado_en, talleSet: new Set<string>(), ordenTalle: new Map<string, number>() };
    m.precio = Math.min(m.precio, Number(f.precio));
    // En la tarjeta solo se muestran los colores y talles que hay para vender
    if (f.disponible > 0) { if (!m.colores.some((c) => c.nombre === f.color)) m.colores.push({ nombre: f.color, hex: f.color_hex }); m.talleSet.add(f.talle); m.ordenTalle.set(f.talle, f.talle_orden); }
    m.disponible += f.disponible;
    modelos.set(f.producto_id, m);
  }
  const q = (filtros.q ?? "").toLowerCase().trim();
  let lista = [...modelos.values()].filter((m) =>
    (!filtros.categoria || m.categoria === filtros.categoria) && (!filtros.linea || m.linea === filtros.linea) && (!filtros.genero || m.genero === filtros.genero) &&
    (!filtros.color || m.colores.some((c) => c.nombre === filtros.color)) &&
    (!filtros.talle || (m.talleSet.has(filtros.talle) && m.escala === (filtros.escala ?? "Adulto"))) &&
    (!q || m.nombre.toLowerCase().includes(q) || (m.marca ?? "").toLowerCase().includes(q) || (m.categoria ?? "").toLowerCase().includes(q)));
  // Lo que se puede comprar primero; después, el orden pedido (por defecto, una mezcla estable de destacados)
  const orden = filtros.orden === "menor" || filtros.orden === "mayor" ? filtros.orden : "nuevo";
  lista = lista.sort((a, b) => Number(b.disponible > 0) - Number(a.disponible > 0)
    || (orden === "menor" ? a.precio - b.precio : orden === "mayor" ? b.precio - a.precio : (a.id * 37) % 101 - (b.id * 37) % 101));   // mezcla estable: que no queden juntas las prendas de una misma marca

  // Los talles de cada tarjeta, en su orden (el 38 antes que el 40)
  lista.forEach((m) => { m.talles = [...m.talleSet].sort((a, b) => (m.ordenTalle.get(a) ?? 0) - (m.ordenTalle.get(b) ?? 0)); });

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

  const link = (cambio: Partial<Filtros>) => {
    const p = new URLSearchParams(Object.entries({ ...filtros, mas: undefined, ...cambio }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return s ? `/tienda?${s}#catalogo` : "/tienda#catalogo";
  };

  // Filtros activos, para mostrarlos como etiquetas que se sacan con un toque
  const activos: { texto: string; quitar: Partial<Filtros> }[] = [
    ...(filtros.categoria ? [{ texto: filtros.categoria, quitar: { categoria: undefined } }] : []),
    ...(filtros.linea ? [{ texto: filtros.linea, quitar: { linea: undefined } }] : []),
    ...(filtros.genero ? [{ texto: filtros.genero, quitar: { genero: undefined } }] : []),
    ...(filtros.talle ? [{ texto: `Talle ${filtros.talle}`, quitar: { talle: undefined, escala: undefined } }] : []),
    ...(filtros.color ? [{ texto: filtros.color, quitar: { color: undefined } }] : []),
    ...(q ? [{ texto: `“${filtros.q}”`, quitar: { q: undefined } }] : []),
  ];
  const hayFiltro = activos.length > 0;
  const nFiltros = activos.filter((a) => !("categoria" in a.quitar)).length;   // la categoría ya se ve en la tira

  // El panel de filtros: el mismo en el celular (pantalla completa) y en la compu (al costado)
  const panel = (
    <div>
      {generos.length > 0 && (
        <Grupo titulo="Para">
          <div className="flex flex-wrap gap-2">{generos.map((g) => (
            <Link key={g} href={link({ genero: filtros.genero === g ? undefined : g })} scroll={false} aria-pressed={filtros.genero === g}
              className={`inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold ${filtros.genero === g ? "border-marca bg-marca text-white" : "border-gray-300 hover:border-marca"}`}>{g}</Link>
          ))}</div>
        </Grupo>
      )}
      <Grupo titulo="Color">
        <div className="flex flex-wrap gap-2.5">{colores.map(([c, hex]) => {
          const activo = filtros.color === c;
          return (
            <Link key={c} href={link({ color: activo ? undefined : c })} scroll={false} aria-pressed={activo} aria-label={c} title={c}
              className={`grid h-11 w-11 place-items-center rounded-full border-2 p-[3px] ${activo ? "border-marca" : "border-transparent hover:border-gray-300"}`}>
              <span className="block h-full w-full rounded-full border border-black/15" style={{ background: hex ?? "#ddd" }} />
            </Link>
          );
        })}</div>
        {filtros.color && <p className="mt-2 text-sm font-semibold">{filtros.color}</p>}
      </Grupo>
      <Grupo titulo="Talle">
        <div className="space-y-4">{tallesPorEscala.map(({ escala, talles }) => (
          <div key={escala}>
            <p className="mb-1.5 text-xs font-semibold text-texto-2">{FILTRO_ESCALA[escala] ?? "Talle"}</p>
            <div className="flex flex-wrap gap-1.5">{talles.map((t) => { const activo = filtros.talle === t && (filtros.escala ?? "Adulto") === escala;
              return <Link key={t} href={link(activo ? { talle: undefined, escala: undefined } : { talle: t, escala: escala === "Adulto" ? undefined : escala })} scroll={false} aria-pressed={activo}
                className={`inline-flex h-10 min-w-10 items-center justify-center rounded-sm border px-2 text-sm ${activo ? "border-marca bg-marca font-semibold text-white" : "border-gray-300 hover:border-marca"}`}>{t}</Link>; })}
            </div>
          </div>
        ))}</div>
      </Grupo>
      {hayFiltro && <Link href="/tienda#catalogo" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold underline underline-offset-4">Quitar todos los filtros</Link>}
    </div>
  );

  const opcionesOrden = ORDENES.map(([valor, texto]) => ({ valor, texto, href: link({ orden: valor === "nuevo" ? undefined : valor }) }));

  return (
    <div className="space-y-6" id="catalogo">
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-extrabold leading-none tracking-[-0.04em]">{filtros.categoria ?? filtros.linea ?? "Toda la tienda"}</h1>
      </div>

      {/* Buscador */}
      <form action="/tienda" className="flex gap-2">
        {Object.entries(filtros).filter(([k, v]) => v && !["q", "mas"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input id="buscar" name="q" defaultValue={filtros.q} placeholder="Buscar remeras, zapatillas, una marca…" className="campo" aria-label="Buscar" />
        <button className="boton px-5">Buscar</button>
      </form>

      {/* Categorías: se deslizan con el dedo */}
      <nav aria-label="Categorías" className="tira -mx-4 flex gap-1 overflow-x-auto border-b border-borde px-4 sm:-mx-6 sm:px-6">
        {[["", "Todo"], ...categorias.map((c) => [c, c])].map(([c, t]) => {
          const activa = (filtros.categoria ?? "") === c;
          return <Link key={t} href={link({ categoria: c || undefined })} scroll={false} aria-current={activa ? "true" : undefined}
            className={`-mb-px inline-flex min-h-12 shrink-0 items-center border-b-2 px-3.5 text-[0.95rem] ${activa ? "border-marca font-bold" : "border-transparent text-texto-2 hover:text-marca"}`}>{t}</Link>;
        })}
      </nav>

      <div className="grid gap-x-10 gap-y-5 lg:grid-cols-[14rem_1fr]">
        {/* Compu: panel fijo al costado */}
        <aside className="hidden lg:block" aria-label="Filtros"><div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2">{panel}</div></aside>

        <div className="min-w-0 space-y-5">
          {/* Barra: filtros (celular), cantidad y orden */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="lg:hidden"><FiltrosMovil cantidad={nFiltros} total={lista.length}>{panel}</FiltrosMovil></div>
              <p className="text-sm text-texto-2" aria-live="polite">{lista.length} {lista.length === 1 ? "prenda" : "prendas"}</p>
            </div>
            <OrdenSelect opciones={opcionesOrden} actual={orden} />
          </div>

          {hayFiltro && (
            <ul className="flex flex-wrap gap-2" aria-label="Filtros aplicados">
              {activos.map((a) => (
                <li key={a.texto}><Link href={link(a.quitar)} scroll={false} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-marca-suave pl-3.5 pr-2.5 text-sm font-semibold hover:bg-gray-200">
                  {a.texto}<X size={15} aria-label="Quitar" /></Link></li>
              ))}
            </ul>
          )}

          {lista.length === 0 ? (
            <div className="rounded-sm border border-dashed border-borde px-6 py-14 text-center">
              <p className="text-lg font-bold">No encontramos nada con esos filtros</p>
              <p className="mt-1 text-texto-2">Probá con otra categoría o sacá algún filtro.</p>
              <Link href="/tienda#catalogo" className="boton mt-5">Ver todo</Link>
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
    </div>
  );
}
