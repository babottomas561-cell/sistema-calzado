// Ficha de un producto: datos, grilla de stock talle × color, ajustes e historial.
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora } from "@/lib/formato";
import Formularios from "./Formularios";
import Fotos from "./Fotos";
import Proveedores, { type FilaProveedor } from "./Proveedores";
import { leerMaestros } from "@/lib/maestros";
import { ExternalLink } from "lucide-react";
import Volver from "@/components/Volver";
import GrillaStock, { LeyendaStock } from "@/components/GrillaStock";
import { exigir } from "@/lib/exigir";

export default async function Producto({ params }: { params: Promise<{ id: string }> }) {
  const { permisos } = await exigir("costos.ver");
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: p }, { data: filas }, { data: movimientos }, maestros, { data: precios }, { data: proveedores }, { data: imagenes }] = await Promise.all([
    supabase.from("productos").select("*, marcas(nombre), categorias(nombre), subcategorias(nombre)").eq("id", Number(id)).single(),
    supabase.from("v_stock").select("variante_id, talle, talle_orden, color, color_hex, sku, stock, reservado, disponible, stock_minimo").eq("producto_id", Number(id)),
    supabase.from("movimientos_stock").select("id, fecha, tipo, cantidad, motivo, venta_id, compra_id, ventas(comprobante), compras(comprobante), variantes!inner(producto_id, talles(nombre), colores(nombre))")
      .eq("variantes.producto_id", Number(id)).order("fecha", { ascending: false }).limit(30),
    leerMaestros(),
    supabase.from("producto_proveedores").select("id, proveedor_id, codigo_proveedor, precio_lista, bonificacion_pct, precio_compra, principal, actualizado_en, proveedores(nombre)")
      .eq("producto_id", Number(id)).order("precio_compra"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("producto_imagenes").select("id, url, principal").eq("producto_id", Number(id)).order("orden").order("id"),
  ]);
  if (!p) notFound();

  // Una fila por variante (con un solo depósito, v_stock ya trae una fila por variante)
  const vs = (filas ?? []).map((f) => ({ ...f, id: f.variante_id ?? 0, talle: f.talle ?? "", color: f.color ?? "",
    stock: f.stock ?? 0, reservado: f.reservado ?? 0, disponible: f.disponible ?? 0, stock_minimo: f.stock_minimo ?? 0 }));
  const marca = (p.marcas as { nombre: string } | null)?.nombre ?? null;
  const categoria = (p.categorias as { nombre: string } | null)?.nombre ?? null;
  const subcategoria = (p.subcategorias as { nombre: string } | null)?.nombre ?? null;
  const producto = { ...p, marca, categoria, subcategoria };
  const total = vs.reduce((s, v) => s + v.stock, 0);

  return (
    <div className="space-y-5">
      <div><Volver href="/admin/productos">Productos</Volver>
        <h1 className="text-2xl font-bold"><span className="mr-2 font-mono text-lg text-texto-2">{p.codigo}</span>{p.nombre}</h1>
        <p className="text-sm text-texto-2">{[marca, categoria, subcategoria, p.genero].filter(Boolean).join(" · ")} · {total} pares en stock
          {p.publicado_web ? <> · <a href={`/producto/${p.id}`} target="_blank" className="text-marca">ver en la tienda <ExternalLink size={13} className="inline" /></a></> : " · no publicado en la tienda"}</p></div>

      <Fotos productoId={p.id} imagenes={imagenes ?? []} />

      <section className="tarjeta space-y-3">
        <h2 className="font-semibold">Stock por talle y color</h2>
        {vs.length === 0 ? <p className="text-sm text-texto-2">Sin variantes todavía.</p> : <GrillaStock variantes={vs} />}
        <LeyendaStock />
        <p className="text-xs text-texto-2">Para sumar stock, registrá una <Link href="/admin/compras/nueva" className="text-marca">compra</Link>.</p>
      </section>

      <Proveedores productoId={p.id} filas={(precios ?? []) as unknown as FilaProveedor[]} todos={proveedores ?? []} />

      <Formularios producto={producto} variantes={vs} {...maestros} edita={permisos.includes("productos.editar")}
        editaPrecio={permisos.includes("precios.editar")} ajusta={permisos.includes("stock.ajustar")} />

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
