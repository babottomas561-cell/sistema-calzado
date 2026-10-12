// Imprimir etiquetas con código de barras: de un artículo, de lo que entró en una compra o de lo que se elija a mano.
// La plantilla (rollo o hoja, tamaño, qué lleva) se elige acá y se ajusta en Impresión. Lo ve quien ve stock o edita productos.
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { datosTienda } from "@/lib/tienda";
import { leerMaestros } from "@/lib/maestros";
import { leerTodo } from "@/lib/informes";
import { COLUMNAS_ETIQUETA, leerPlantilla, unaPorVariante, type FilaEtiqueta } from "@/lib/etiquetas";
import Volver from "@/components/Volver";
import Etiquetas from "./Etiquetas";

export default async function PaginaEtiquetas({ searchParams }: { searchParams: Promise<{ producto?: string; productos?: string; compra?: string; variantes?: string; plantilla?: string }> }) {
  const { permisos } = await exigir("stock.ver", "productos.editar");
  const { producto, productos, compra, variantes, plantilla } = await searchParams;
  const supabase = await crearCliente();
  const [{ data: plantillas }, { data: conf }, tienda, { maestros }] = await Promise.all([
    supabase.from("plantillas_etiqueta").select("*").eq("activa", true).order("orden").order("id"),
    supabase.from("configuracion_impresion").select("etiqueta_plantilla_id").maybeSingle(),
    datosTienda(),
    leerMaestros(),
  ]);

  // Qué etiquetas se proponen según de dónde viene el pedido, y cuántas de cada una
  let origen = "Elegí qué querés etiquetar";
  let volver = { href: "/admin/productos", texto: "Productos" };
  let filas: (FilaEtiqueta & { cantidad: number })[] = [];
  if (producto) {
    const { data } = await supabase.from("v_stock").select(COLUMNAS_ETIQUETA).eq("producto_id", Number(producto)).order("talle_orden");
    const delProducto = unaPorVariante((data ?? []) as Record<string, unknown>[]);
    // Con stock: una por unidad que hay; sin stock: una de cada una (para empezar)
    const hayStock = delProducto.some((f) => f.stock > 0);
    filas = delProducto.map((f) => ({ ...f, cantidad: hayStock ? Math.max(f.stock, 0) : 1 }));
    origen = delProducto[0] ? `Artículo ${delProducto[0].nombre}` : origen;
    volver = { href: `/admin/productos/${producto}`, texto: delProducto[0]?.nombre ?? "Producto" };
  } else if (productos) {
    // Varios artículos de una vez (la lista de productos manda los que se tildaron)
    const ids = [...new Set(productos.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 800);
    if (ids.length) {
      const data = await leerTodo((a, b) => supabase.from("v_stock").select(COLUMNAS_ETIQUETA).in("producto_id", ids).order("nombre").order("talle_orden").range(a, b));
      filas = unaPorVariante(data as Record<string, unknown>[]).slice(0, 1500).map((f) => ({ ...f, cantidad: Math.max(f.stock, 0) }));
    }
    origen = `Selección de ${ids.length} ${ids.length === 1 ? "artículo" : "artículos"}`;
  } else if (compra) {
    const [{ data: c }, { data: items }] = await Promise.all([
      supabase.from("compras").select("comprobante").eq("id", Number(compra)).maybeSingle(),
      supabase.from("compra_items").select("variante_id, cantidad").eq("compra_id", Number(compra)),
    ]);
    const cantidades = new Map<number, number>();
    for (const i of items ?? []) cantidades.set(i.variante_id, (cantidades.get(i.variante_id) ?? 0) + i.cantidad);
    if (cantidades.size) {
      const { data } = await supabase.from("v_stock").select(COLUMNAS_ETIQUETA).in("variante_id", [...cantidades.keys()]).order("nombre").order("talle_orden");
      filas = unaPorVariante((data ?? []) as Record<string, unknown>[]).map((f) => ({ ...f, cantidad: cantidades.get(f.variante_id) ?? 0 }));
    }
    origen = `Lo que entró en la compra ${c?.comprobante ?? ""}`.trim();
    volver = { href: `/admin/compras/${compra}`, texto: "Compra" };
  } else if (variantes) {
    const pedidas = new Map<number, number>();
    for (const par of variantes.split(",")) { const [id, n] = par.split(":").map(Number); if (id > 0) pedidas.set(id, Math.max(1, n || 1)); }
    if (pedidas.size) {
      const { data } = await supabase.from("v_stock").select(COLUMNAS_ETIQUETA).in("variante_id", [...pedidas.keys()]).order("nombre").order("talle_orden");
      filas = unaPorVariante((data ?? []) as Record<string, unknown>[]).map((f) => ({ ...f, cantidad: pedidas.get(f.variante_id) ?? 1 }));
    }
    origen = "Selección";
  }

  const lista = (plantillas ?? []).map((p) => leerPlantilla(p as Record<string, unknown>));
  return (
    <div className="space-y-4 print:space-y-0">
      <div className="space-y-1 print:hidden">
        <Volver href={volver.href}>{volver.texto}</Volver>
        <h1 className="text-2xl font-bold">Etiquetas</h1>
        <p className="text-sm text-texto-2">{origen}. Se imprimen con el código de barras de cada talle y color.</p>
      </div>
      <Etiquetas plantillas={lista} plantillaInicial={lista.find((p) => p.id === Number(plantilla))?.id ?? conf?.etiqueta_plantilla_id ?? lista[0]?.id ?? null} tienda={tienda.nombre}
        filasIniciales={filas} puedeGenerar={permisos.includes("productos.editar")} puedeConfigurar={permisos.includes("tablas.editar")}
        marcas={maestros.marcas.map((m) => m.nombre)} categorias={maestros.categorias.map((c) => c.nombre)} />
    </div>
  );
}
