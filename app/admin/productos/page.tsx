// Listado de productos con su stock total. Se pueden tildar varios y mandarlos juntos a imprimir etiquetas.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { Plus } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import ListaProductos, { type FilaProducto } from "./ListaProductos";

export default async function Productos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { permisos } = await exigir("costos.ver_precio_compra");
  const { q = "" } = await searchParams;
  const supabase = await crearCliente();
  let consulta = supabase.from("productos").select("id, codigo, nombre, genero, precio_venta, activo, publicado_web, marcas(nombre), categorias(nombre), variantes(stock(cantidad))").order("nombre");
  if (q) {
    const b = q.replace(/[%,()]/g, "");
    // También se encuentra por el código de barras o el código interno (SKU) de cualquiera de sus variantes
    const { data: porCodigo } = await supabase.from("variantes").select("producto_id").or(`codigo_barras.ilike.${b}%,sku.ilike.${b}%`).limit(200);
    const ids = [...new Set((porCodigo ?? []).map((v) => v.producto_id))];
    consulta = consulta.or(`nombre.ilike.%${b}%,codigo.ilike.%${b}%${ids.length ? `,id.in.(${ids.join(",")})` : ""}`);
  }
  const { data: productos, error } = await consulta;
  const filas: FilaProducto[] = (productos ?? []).map((p) => ({
    id: p.id, codigo: p.codigo, nombre: p.nombre, genero: p.genero, precio_venta: Number(p.precio_venta), activo: p.activo, publicado_web: p.publicado_web,
    marca: (p.marcas as unknown as { nombre: string } | null)?.nombre ?? null, categoria: (p.categorias as unknown as { nombre: string } | null)?.nombre ?? null,
    unidades: (p.variantes as unknown as { stock: { cantidad: number }[] }[]).reduce((s, v) => s + v.stock.reduce((a, x) => a + x.cantidad, 0), 0),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Link href="/admin/productos/nuevo" className="boton"><Plus size={16} /> Nuevo producto</Link>
      </div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por modelo, código o código de barras…" className="campo" /><button className="boton-sec">Buscar</button></form>
      {error && <p className="text-error">{error.message}</p>}
      <ListaProductos productos={filas} vacio={`No hay productos${q ? " con esa búsqueda" : ""}.`} puedeEtiquetar={puede(permisos, "stock.ver", "productos.editar")} />
    </div>
  );
}
