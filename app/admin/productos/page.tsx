// Listado de productos con su stock total.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { numero, pesos } from "@/lib/formato";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";
import { Plus } from "lucide-react";

export default async function Productos({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const supabase = await crearCliente();
  let consulta = supabase.from("productos").select("id, codigo, nombre, genero, precio_venta, activo, publicado_web, marcas(nombre), categorias(nombre), variantes(stock(cantidad))").order("nombre");
  if (q) { const b = q.replace(/[%,()]/g, ""); consulta = consulta.or(`nombre.ilike.%${b}%,codigo.ilike.%${b}%`); }
  const { data: productos, error } = await consulta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Productos</h1>
        <Link href="/admin/productos/nuevo" className="boton"><Plus size={16} /> Nuevo producto</Link>
      </div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por modelo o código…" className="campo" /><button className="boton-sec">Buscar</button></form>
      {error && <p className="text-error">{error.message}</p>}
      <ListaMovil vacio={productos?.length === 0 && `No hay productos${q ? " con esa búsqueda" : ""}.`}>
        {(productos ?? []).map((p) => {
          const pares = (p.variantes as unknown as { stock: { cantidad: number }[] }[])
            .reduce((s, v) => s + v.stock.reduce((a, x) => a + x.cantidad, 0), 0);
          const marca = (p.marcas as unknown as { nombre: string } | null)?.nombre;
          return (
            <FilaMovil key={p.id} href={`/admin/productos/${p.id}`} atenuado={!p.activo} titulo={p.nombre}
              detalle={<><span className="font-mono">{p.codigo}</span>{marca ? ` · ${marca}` : ""} · {pesos(p.precio_venta)}</>}
              extra={<>{!p.activo && <span className="chip bg-gray-100 text-texto-2">inactivo</span>}{p.publicado_web && <span className="chip bg-blue-50 text-marca">en la tienda</span>}</>}
              valor={<span className={`chip ${pares === 0 ? "bg-red-100 text-error" : "bg-gray-100"}`}>{numero(pares)} pares</span>} />
          );
        })}
      </ListaMovil>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Modelo</th><th>Marca</th><th>Categoría</th><th className="text-right">Precio</th><th className="text-right">Stock</th></tr></thead>
          <tbody>
            {(productos ?? []).map((p) => {
              const pares = (p.variantes as unknown as { stock: { cantidad: number }[] }[])
                .reduce((s, v) => s + v.stock.reduce((a, x) => a + x.cantidad, 0), 0);
              const marca = (p.marcas as unknown as { nombre: string } | null)?.nombre;
              const categoria = (p.categorias as unknown as { nombre: string } | null)?.nombre;
              return (
                <tr key={p.id} className={p.activo ? "" : "opacity-50"}>
                  <td className="font-mono text-xs">{p.codigo}</td>
                  <td><Link href={`/admin/productos/${p.id}`} className="font-semibold text-marca hover:underline">{p.nombre}</Link>
                    {!p.activo && <span className="chip ml-2 bg-gray-100 text-texto-2">inactivo</span>}
                    {p.publicado_web && <span className="chip ml-2 bg-blue-50 text-marca">en la tienda</span>}</td>
                  <td>{marca ?? "—"}</td>
                  <td>{categoria ?? "—"}{p.genero ? ` · ${p.genero}` : ""}</td>
                  <td className="text-right">{pesos(p.precio_venta)}</td>
                  <td className="text-right"><span className={`chip ${pares === 0 ? "bg-red-100 text-error" : "bg-gray-100"}`}>{numero(pares)} pares</span></td>
                </tr>
              );
            })}
            {productos?.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-texto-2">No hay productos{q ? " con esa búsqueda" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
