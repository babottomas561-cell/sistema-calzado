// Stock por modelo (grilla talle × color), con filtros y valorización a costo.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { numero, pesos } from "@/lib/formato";
import { leerTodo } from "@/lib/informes";
import GrillaStock, { LeyendaStock, type CeldaStock } from "@/components/GrillaStock";
import { exigir } from "@/lib/exigir";

const FILTROS = { todo: "Todo", bajo: "Para reponer", sin: "Sin stock" } as const;

export default async function Stock({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const { permisos } = await exigir("stock.ver");
  const veCostos = permisos.includes("costos.ver");   // sin el permiso, la base devuelve el costo vacío
  const { filtro: f = "todo", q = "" } = await searchParams;
  const filtro = (f in FILTROS ? f : "todo") as keyof typeof FILTROS;
  const supabase = await crearCliente();
  // De a páginas: con muchos modelos se pasa de las 1000 filas que devuelve una consulta
  const consulta = (desde: number, hasta: number) => {
    let c = supabase.from("v_stock").select("*").order("nombre").order("variante_id");
    if (filtro === "bajo") c = c.eq("stock_bajo", true);
    if (filtro === "sin") c = c.lte("disponible", 0);
    if (q) { const b = q.replace(/[%,()]/g, ""); c = c.or(`nombre.ilike.%${b}%,sku.ilike.${b}%`); }
    return c.range(desde, hasta);
  };
  let filas: Awaited<ReturnType<typeof consulta>>["data"] = [], error: string | null = null;
  try { filas = await leerTodo(consulta); } catch (e) { error = (e as Error).message; }
  const lista = (filas ?? []).map((v) => ({ ...v, talle: v.talle ?? "", color: v.color ?? "", stock: v.stock ?? 0,
    reservado: v.reservado ?? 0, disponible: v.disponible ?? 0, stock_minimo: v.stock_minimo ?? 0 }));

  // Una tarjeta por modelo; con un filtro activo, solo las variantes que cumplen
  const porModelo = new Map<number, { id: number; codigo: string | null; nombre: string | null; marca: string | null; pares: number; variantes: CeldaStock[] }>();
  for (const v of lista) {
    const id = v.producto_id ?? 0;
    const m = porModelo.get(id) ?? { id, codigo: v.codigo, nombre: v.nombre, marca: v.marca, pares: 0, variantes: [] };
    m.pares += v.stock;
    m.variantes.push(v);
    porModelo.set(id, m);
  }
  const modelos = [...porModelo.values()];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stock</h1>
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(FILTROS).map(([k, t]) => (
          <Link key={k} href={`/admin/stock?filtro=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-lg border px-3 py-1.5 text-sm ${k === filtro ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{t}</Link>
        ))}
        <form className="flex w-full gap-2 md:ml-auto md:w-64"><input type="hidden" name="filtro" value={filtro} /><input name="q" defaultValue={q} placeholder="Modelo o código…" className="campo py-1.5" /></form>
      </div>
      {error && <p className="text-error">{error}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="tarjeta"><div className="etiqueta">Pares</div><div className="text-xl font-bold">{numero(lista.reduce((s, v) => s + v.stock, 0))}</div></div>
        {veCostos && <div className="tarjeta"><div className="etiqueta">Valor a costo</div><div className="text-xl font-bold">{pesos(lista.reduce((s, v) => s + Number(v.valor_costo), 0))}</div></div>}
        <div className={`tarjeta ${veCostos ? "col-span-2 md:col-span-1" : ""}`}><div className="etiqueta">Valor a precio de venta</div><div className="text-xl font-bold">{pesos(lista.reduce((s, v) => s + v.stock * Number(v.precio_venta), 0))}</div></div>
      </div>
      <LeyendaStock />
      <div className="grid gap-3 lg:grid-cols-2">
        {modelos.map((m) => (
          <section key={m.id} className="tarjeta">
            <div className="mb-3 flex items-start justify-between gap-3">
              <Link href={veCostos ? `/admin/productos/${m.id}` : `/admin/stock?q=${encodeURIComponent(m.nombre ?? "")}`} className="min-w-0">
                <div className="truncate font-semibold text-marca hover:underline">{m.nombre}</div>
                <div className="text-xs text-texto-2"><span className="font-mono">{m.codigo}</span>{m.marca ? ` · ${m.marca}` : ""}</div>
              </Link>
              <div className="shrink-0 text-right"><div className="font-bold">{numero(m.pares)}</div><div className="text-xs text-texto-2">pares</div></div>
            </div>
            <GrillaStock variantes={m.variantes} />
          </section>
        ))}
        {modelos.length === 0 && <p className="tarjeta col-span-full py-8 text-center text-texto-2">Nada para mostrar.</p>}
      </div>
    </div>
  );
}
