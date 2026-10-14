// Precios: ajuste masivo de precios de venta y compra, e integración de listas de precios (local y web).
import Link from "next/link";
import { Sliders, Tags } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { leerTodo } from "@/lib/informes";
import AjustePrecios, { type Articulo } from "./AjustePrecios";
import Historial, { type Ajuste } from "./Historial";
import ListasDePrecios from "./ListasDePrecios";

export default async function Precios({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string }>;
}) {
  const { vista } = await searchParams;
  const esListas = vista === "listas";

  const { supabase, permisos } = await exigir("precios.editar", "proveedores.gestionar", "compras.registrar");
  const veCostos = permisos.includes("costos.ver_precio_compra");
  const puedeVenta = permisos.includes("precios.editar");
  const puedeCompra = veCostos && (permisos.includes("proveedores.gestionar") || permisos.includes("compras.registrar"));

  // Los artículos salen de v_stock (una fila por variante → uno por modelo) para no depender de ver costos
  const [variantes, { data: relaciones }, { data: proveedores }, { data: ajustes }, { data: tienda }, { data: listas }, { data: excepciones }] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_stock").select("producto_id, codigo, nombre, marca, categoria, precio_venta, precio_compra").order("variante_id").range(a, b)),
    veCostos ? supabase.from("producto_proveedores").select("producto_id, proveedor_id") : Promise.resolve({ data: [] }),
    veCostos ? supabase.from("proveedores").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
    supabase.from("ajustes_precios").select("id, fecha, que, modo, valor, redondeo, descripcion, cantidad, deshecho_en, quien:perfiles!ajustes_precios_usuario_id_fkey(nombre), proveedores(nombre)")
      .order("fecha", { ascending: false }).limit(20),
    supabase.from("configuracion_tienda").select("listas_precios_activas").single(),
    supabase.from("listas_precios").select("*").order("id"),
    supabase.from("lista_precio_items").select("lista_id, producto_id, precio"),
  ]);

  const articulos = new Map<number, Articulo>();
  for (const v of variantes) {
    const id = v.producto_id ?? 0;
    if (!articulos.has(id)) articulos.set(id, { id, codigo: v.codigo ?? "", nombre: v.nombre ?? "", marca: v.marca, rubro: v.categoria,
      precio_venta: Number(v.precio_venta ?? 0), precio_compra: v.precio_compra === null ? null : Number(v.precio_compra), proveedores: [] });
  }
  for (const r of relaciones ?? []) articulos.get(r.producto_id)?.proveedores.push(r.proveedor_id);

  const listaArticulos = [...articulos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios</h1>
        <p className="text-sm text-texto-2">
          Ajustá precios de forma masiva o gestioná listas de precios para diferenciar mostrador y tienda online.
        </p>
      </div>

      {/* Selector de pestañas */}
      <nav className="flex gap-2 border-b border-borde pb-2">
        <Link
          href="/admin/precios"
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            !esListas
              ? "bg-white text-marca shadow-xs ring-1 ring-borde"
              : "text-texto-2 hover:bg-white/60 hover:text-gray-900"
          }`}
        >
          <Sliders size={16} /> Ajuste masivo
        </Link>
        <Link
          href="/admin/precios?vista=listas"
          className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            esListas
              ? "bg-white text-marca shadow-xs ring-1 ring-borde"
              : "text-texto-2 hover:bg-white/60 hover:text-gray-900"
          }`}
        >
          <Tags size={16} /> Listas de precios
          {tienda?.listas_precios_activas && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-ok">
              Activas
            </span>
          )}
        </Link>
      </nav>

      {esListas ? (
        <ListasDePrecios
          listas={listas ?? []}
          articulos={listaArticulos}
          excepciones={excepciones ?? []}
          activasInicial={!!tienda?.listas_precios_activas}
          puedeVenta={puedeVenta}
        />
      ) : (
        <>
          <AjustePrecios
            articulos={listaArticulos}
            proveedores={proveedores ?? []}
            puedeVenta={puedeVenta}
            puedeCompra={puedeCompra}
          />
          <Historial ajustes={(ajustes ?? []) as unknown as Ajuste[]} />
        </>
      )}
    </div>
  );
}
