// Ficha de un producto: datos, grilla de stock talle × color, ajustes e historial.
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/formato";
import Formularios from "./Formularios";
import Proveedores, { type FilaProveedor } from "./Proveedores";
import { leerMaestros } from "@/lib/maestros";
import { ExternalLink } from "lucide-react";
import Volver from "@/components/Volver";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: p }, { data: filas }, { data: movimientos }, maestros, { data: precios }, { data: proveedores }] = await Promise.all([
    supabase.from("productos").select("*, marcas(nombre), categorias(nombre), subcategorias(nombre)").eq("id", Number(id)).single(),
    supabase.from("v_stock").select("variante_id, talle, talle_orden, color, color_hex, sku, stock, reservado, disponible, stock_minimo").eq("producto_id", Number(id)),
    supabase.from("movimientos_stock").select("id, fecha, tipo, cantidad, motivo, venta_id, compra_id, ventas(comprobante), compras(comprobante), variantes!inner(producto_id, talles(nombre), colores(nombre))")
      .eq("variantes.producto_id", Number(id)).order("fecha", { ascending: false }).limit(30),
    leerMaestros(),
    supabase.from("producto_proveedores").select("id, proveedor_id, codigo_proveedor, precio_lista, bonificacion_pct, precio_compra, principal, actualizado_en, proveedores(nombre)")
      .eq("producto_id", Number(id)).order("precio_compra"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
  ]);
  if (!p) notFound();

  // Una fila por variante (con un solo depósito, v_stock ya trae una fila por variante)
  const vs = (filas ?? []).map((f) => ({ ...f, id: f.variante_id ?? 0, talle: f.talle ?? "", color: f.color ?? "",
    stock: f.stock ?? 0, reservado: f.reservado ?? 0, disponible: f.disponible ?? 0, stock_minimo: f.stock_minimo ?? 0 }));
  const marca = (p.marcas as { nombre: string } | null)?.nombre ?? null;
  const categoria = (p.categorias as { nombre: string } | null)?.nombre ?? null;
  const subcategoria = (p.subcategorias as { nombre: string } | null)?.nombre ?? null;
  const producto = { ...p, marca, categoria, subcategoria };
  // Talles en su orden real (38 < 38.5 < 39), que viene de la tabla de talles
  const talles = [...new Map(vs.map((v) => [v.talle, v.talle_orden])).entries()].sort((a, b) => Number(a[1]) - Number(b[1])).map(([t]) => t);
  const colores = [...new Set(vs.map((v) => v.color))].sort();
  const celda = (t: string, c: string) => vs.find((v) => v.talle === t && v.color === c);
  const total = vs.reduce((s, v) => s + v.stock, 0);

  return (
    <div className="space-y-5">
      <div><Volver href="/admin/productos">Productos</Volver>
        <h1 className="text-2xl font-bold"><span className="mr-2 font-mono text-lg text-texto-2">{p.codigo}</span>{p.nombre}</h1>
        <p className="text-sm text-texto-2">{[marca, categoria, subcategoria, p.genero].filter(Boolean).join(" · ")} · {total} pares en stock
          {p.publicado_web ? <> · <a href={`/producto/${p.id}`} target="_blank" className="text-marca">ver en la tienda <ExternalLink size={13} className="inline" /></a></> : " · no publicado en la tienda"}</p></div>

      <section className="tarjeta overflow-x-auto">
        <h2 className="mb-3 font-semibold">Stock por talle y color</h2>
        {vs.length === 0 ? <p className="text-sm text-texto-2">Sin variantes todavía.</p> : (
          <table className="tabla w-auto">
            <thead><tr><th>Talle</th>{colores.map((c) => <th key={c} className="text-center">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-gray-300" style={{ background: vs.find((v) => v.color === c)?.color_hex ?? "transparent" }} />{c}</th>)}</tr></thead>
            <tbody>
              {talles.map((t) => (
                <tr key={t}><td className="font-semibold">{t}</td>
                  {colores.map((c) => {
                    const v = celda(t, c);
                    return <td key={c} className="text-center">{v ? (
                      <span title={v.reservado ? `${v.reservado} reservado(s) en pedidos` : undefined} className={`chip min-w-10 justify-center ${v.disponible === 0 ? "bg-red-100 text-error" : v.disponible <= v.stock_minimo ? "bg-amber-100 text-alerta" : "bg-green-100 text-ok"}`}>{v.stock}{v.reservado ? ` (${v.reservado}R)` : ""}</span>
                    ) : <span className="text-gray-300">·</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-texto-2">Verde: hay stock · Amarillo: en el mínimo o por debajo · Rojo: sin stock · (2R) = 2 pares reservados en pedidos. Para sumar stock, registrá una <Link href="/admin/compras/nueva" className="text-marca">compra</Link>.</p>
      </section>

      <Proveedores productoId={p.id} filas={(precios ?? []) as unknown as FilaProveedor[]} todos={proveedores ?? []} />

      <Formularios producto={producto} variantes={vs} {...maestros} />

      <section className="tarjeta overflow-x-auto">
        <h2 className="mb-2 font-semibold">Historial de movimientos</h2>
        <table className="tabla">
          <thead><tr><th>Fecha</th><th>Variante</th><th>Tipo</th><th className="text-right">Cantidad</th><th>Detalle</th></tr></thead>
          <tbody>
            {(movimientos ?? []).map((m) => {
              const mv = m.variantes as unknown as { talles: { nombre: string }; colores: { nombre: string } };
              const v = { talle: mv.talles.nombre, color: mv.colores.nombre };
              return (
                <tr key={m.id}>
                  <td>{fechaHora(m.fecha)}</td><td>{v.talle} · {v.color}</td><td className="capitalize">{m.tipo}</td>
                  <td className={`text-right font-semibold ${m.cantidad > 0 ? "text-ok" : "text-error"}`}>{m.cantidad > 0 ? "+" : ""}{m.cantidad}</td>
                  <td>{m.venta_id ? <Link href={`/admin/ventas/${m.venta_id}`} className="font-mono text-marca">Venta {(m.ventas as unknown as { comprobante: string } | null)?.comprobante}</Link>
                    : m.compra_id ? <Link href={`/admin/compras/${m.compra_id}`} className="font-mono text-marca">Ingreso {(m.compras as unknown as { comprobante: string } | null)?.comprobante}</Link> : m.motivo}</td>
                </tr>
              );
            })}
            {movimientos?.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-texto-2">Sin movimientos.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
