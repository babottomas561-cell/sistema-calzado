// Precios: ajuste masivo de precios de venta y de compra, y el historial de ajustes.
import { exigir } from "@/lib/exigir";
import { leerTodo } from "@/lib/informes";
import AjustePrecios, { type Articulo } from "./AjustePrecios";
import Historial, { type Ajuste } from "./Historial";

export default async function Precios() {
  const { supabase, permisos } = await exigir("precios.editar", "proveedores.gestionar", "compras.registrar");
  const veCostos = permisos.includes("costos.ver");
  const puedeVenta = permisos.includes("precios.editar");
  const puedeCompra = veCostos && (permisos.includes("proveedores.gestionar") || permisos.includes("compras.registrar"));

  // Los artículos salen de v_stock (una fila por variante → uno por modelo) para no depender de ver costos
  const [variantes, { data: relaciones }, { data: proveedores }, { data: ajustes }] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_stock").select("producto_id, codigo, nombre, marca, categoria, precio_venta, precio_compra").order("variante_id").range(a, b)),
    veCostos ? supabase.from("producto_proveedores").select("producto_id, proveedor_id") : Promise.resolve({ data: [] }),
    veCostos ? supabase.from("proveedores").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
    supabase.from("ajustes_precios").select("id, fecha, que, modo, valor, redondeo, descripcion, cantidad, deshecho_en, quien:perfiles!ajustes_precios_usuario_id_fkey(nombre), proveedores(nombre)")
      .order("fecha", { ascending: false }).limit(20),
  ]);

  const articulos = new Map<number, Articulo>();
  for (const v of variantes) {
    const id = v.producto_id ?? 0;
    if (!articulos.has(id)) articulos.set(id, { id, codigo: v.codigo ?? "", nombre: v.nombre ?? "", marca: v.marca, rubro: v.categoria,
      precio_venta: Number(v.precio_venta ?? 0), precio_compra: v.precio_compra === null ? null : Number(v.precio_compra), proveedores: [] });
  }
  for (const r of relaciones ?? []) articulos.get(r.producto_id)?.proveedores.push(r.proveedor_id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios</h1>
        <p className="text-sm text-texto-2">Subí o bajá precios de muchos artículos de una vez. Antes de aplicar ves cada cambio, y después lo podés deshacer.</p>
      </div>
      <AjustePrecios articulos={[...articulos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))} proveedores={proveedores ?? []}
        puedeVenta={puedeVenta} puedeCompra={puedeCompra} />
      <Historial ajustes={(ajustes ?? []) as unknown as Ajuste[]} />
    </div>
  );
}
