// Catálogo de la tienda: productos publicados, agrupados por modelo, con filtros.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { pesos } from "@/lib/formato";
import { Footprints } from "lucide-react";

type Fila = { variante_id: number; producto_id: number; nombre: string; marca: string | null; categoria: string | null; genero: string | null;
  imagen_url: string | null; talle: string; talle_orden: number; color: string; color_hex: string | null; precio: number; disponible: number };

// Botón de filtro
function Chip({ activo, href, children }: { activo: boolean; href: string; children: React.ReactNode }) {
  return <Link href={href} className={`rounded-full border px-3 py-1 text-sm ${activo ? "border-marca bg-marca text-white" : "border-borde bg-white hover:border-marca"}`}>{children}</Link>;
}

export default async function Catalogo({ searchParams }: { searchParams: Promise<{ categoria?: string; genero?: string; talle?: string; q?: string }> }) {
  const filtros = await searchParams;
  const supabase = await crearCliente();
  const { data } = await supabase.from("v_catalogo").select("*");
  const filas = (data ?? []) as Fila[];

  // Opciones de filtro (de lo que hay publicado)
  const categorias = [...new Set(filas.map((f) => f.categoria).filter(Boolean))] as string[];
  const generos = [...new Set(filas.map((f) => f.genero).filter(Boolean))] as string[];
  const talles = [...new Map(filas.filter((f) => f.disponible > 0).map((f) => [f.talle, f.talle_orden])).entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);

  // Agrupar por modelo
  const modelos = new Map<number, { id: number; nombre: string; marca: string | null; categoria: string | null; genero: string | null; imagen: string | null;
    precio: number; colores: Map<string, string | null>; talles: Map<string, number>; disponible: number }>();
  for (const f of filas) {
    const m = modelos.get(f.producto_id) ?? { id: f.producto_id, nombre: f.nombre, marca: f.marca, categoria: f.categoria, genero: f.genero, imagen: f.imagen_url,
      precio: Number(f.precio), colores: new Map(), talles: new Map<string, number>(), disponible: 0 };
    m.precio = Math.min(m.precio, Number(f.precio));
    // En la tarjeta solo se muestran los colores y talles que hay para vender
    if (f.disponible > 0) { m.colores.set(f.color, f.color_hex); m.talles.set(f.talle, f.talle_orden); }
    m.disponible += f.disponible;
    modelos.set(f.producto_id, m);
  }
  const q = (filtros.q ?? "").toLowerCase();
  const lista = [...modelos.values()].filter((m) =>
    (!filtros.categoria || m.categoria === filtros.categoria) && (!filtros.genero || m.genero === filtros.genero) &&
    (!filtros.talle || m.talles.has(filtros.talle)) && (!q || m.nombre.toLowerCase().includes(q) || (m.marca ?? "").toLowerCase().includes(q)));

  const link = (cambio: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...filtros, ...cambio }).filter(([, v]) => v) as [string, string][]);
    return `/?${p}`;
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-r from-blue-700 to-blue-500 px-6 py-8 text-white">
        <h1 className="text-2xl font-bold md:text-3xl">Calzado para todos los días</h1>
        <p className="mt-1 opacity-90">Elegí tu modelo y tu talle. Retirás en el local o te lo enviamos.</p>
      </div>
      <form className="flex gap-2">
        {Object.entries(filtros).filter(([k]) => k !== "q").map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <input name="q" defaultValue={filtros.q} placeholder="Buscar modelo o marca…" className="campo" /><button className="boton-sec">Buscar</button>
      </form>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2"><Chip activo={!filtros.categoria} href={link({ categoria: undefined })}>Todo</Chip>
          {categorias.map((c) => <Chip key={c} activo={filtros.categoria === c} href={link({ categoria: c })}>{c}</Chip>)}</div>
        <div className="flex flex-wrap gap-2">{generos.map((g) => <Chip key={g} activo={filtros.genero === g} href={link({ genero: filtros.genero === g ? undefined : g })}>{g}</Chip>)}</div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-sm text-texto-2">Talle:</span>
          {talles.map((t) => <Chip key={t} activo={filtros.talle === t} href={link({ talle: filtros.talle === t ? undefined : t })}>{t}</Chip>)}</div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {lista.map((m) => (
          <Link key={m.id} href={`/producto/${m.id}`} className="group overflow-hidden rounded-xl border border-borde bg-white transition hover:shadow-md">
            <div className="grid aspect-square place-items-center bg-gray-100 text-5xl">
              {m.imagen ? <img src={m.imagen} alt={m.nombre} className="h-full w-full object-cover" /> : <Footprints size={56} className="text-gray-300" />}
            </div>
            <div className="space-y-1 p-3">
              <div className="text-xs uppercase tracking-wide text-texto-2">{m.marca}</div>
              <div className="font-semibold leading-tight group-hover:text-marca">{m.nombre}</div>
              <div className="font-bold">{pesos(m.precio)}</div>
              <div className="flex gap-1">{[...m.colores.entries()].map(([c, hex]) => <span key={c} title={c} className="h-3.5 w-3.5 rounded-full border border-gray-300" style={{ background: hex ?? "#ddd" }} />)}</div>
              <div className="text-xs text-texto-2">{m.disponible > 0 ? `Talles: ${[...m.talles].sort((a, b) => a[1] - b[1]).map(([t]) => t).join(", ")}` : "Sin stock"}</div>
            </div>
          </Link>
        ))}
        {lista.length === 0 && <p className="col-span-full py-10 text-center text-texto-2">No encontramos productos con esos filtros.</p>}
      </div>
    </div>
  );
}
