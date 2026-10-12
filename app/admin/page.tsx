// Inicio: cómo viene el negocio hoy y en el mes. Cada bloque aparece según el rol: la cajera ve lo
// que vendió ella; quien ve todas las ventas, el negocio entero; la ganancia, solo quien ve costos.
import Link from "next/link";
import { usuarioActual } from "@/lib/supabase/server";
import { puede } from "@/lib/permisos";
import { FilaMovil } from "@/components/ListaMovil";
import { leerTodo } from "@/lib/informes";
import { diaArgentina, fechaHora, inicioDe, numero, pesos } from "@/lib/formato";
import { ChevronRight, Lock, MessageCircleMore, Plus, ShoppingBag, TriangleAlert, Trophy } from "lucide-react";

const vacio = { data: [] as never[], count: 0 };

export default async function Inicio({ searchParams }: { searchParams: Promise<{ sin_permiso?: string }> }) {
  const { sin_permiso } = await searchParams;
  const { supabase, permisos } = await usuarioActual();
  const todas = puede(permisos, "ventas.ver_todas", "informes.ventas");   // ve el negocio entero
  const vende = puede(permisos, "ventas.registrar");
  const veStock = puede(permisos, "stock.ver");
  const veCostos = puede(permisos, "costos.ver");
  const hoy = inicioDe("hoy"), mes = inicioDe("mes");

  // La base ya filtra: sin "ver todas", ventas devuelve solo las propias
  const [ventasHoy, ventasMes, itemsMes, stock, ultimas, pedidos, seguimientos] = await Promise.all([
    supabase.from("ventas").select("total").gte("fecha", hoy),
    supabase.from("ventas").select("total").gte("fecha", mes),
    // Importes netos (con descuento y ajuste por medio de pago), los mismos que suma "Vendido hoy".
    // De a páginas: un mes de ventas o el stock completo pasan enseguida las 1000 filas por consulta.
    todas ? leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, modelo, cantidad, importe_neto, margen_neto, venta_id").gte("fecha", mes).order("id").range(a, b)) : Promise.resolve([]),
    veStock ? leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, nombre, talle, color, stock, disponible, stock_minimo, valor_costo, stock_bajo").order("variante_id").range(a, b)) : Promise.resolve([]),
    supabase.from("ventas").select("id, comprobante, fecha, total, canal, clientes(nombre)").order("fecha", { ascending: false }).limit(5),
    puede(permisos, "pedidos.gestionar") ? supabase.from("pedidos").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "confirmado", "preparado"]) : vacio,
    puede(permisos, "clientes.ver") ? supabase.from("interacciones").select("id", { count: "exact", head: true }).eq("hecha", false).lte("proxima_fecha", diaArgentina()) : vacio,
  ]);

  const suma = (l: { total: number }[] | null) => (l ?? []).reduce((s, v) => s + Number(v.total), 0);
  const totalHoy = suma(ventasHoy.data);
  // Las columnas de una vista llegan tipadas como posible null: se normalizan acá
  const items = itemsMes.map((i) => ({ ...i, nombre: i.modelo ?? "", cantidad: i.cantidad ?? 0 }));
  const paresMes = items.reduce((s, i) => s + i.cantidad, 0);
  const margenMes = items.reduce((s, i) => s + Number(i.margen_neto), 0);
  const facturadoMes = todas ? items.reduce((s, i) => s + Number(i.importe_neto), 0) : suma(ventasMes.data);
  const filasStock = stock.map((v) => ({ ...v, stock: v.stock ?? 0, disponible: v.disponible ?? 0 }));
  const valorStock = filasStock.reduce((s, v) => s + Number(v.valor_costo), 0);
  const paresStock = filasStock.reduce((s, v) => s + v.stock, 0);
  const bajos = filasStock.filter((v) => v.stock_bajo).sort((a, b) => a.disponible - b.disponible);

  // Modelos más vendidos del mes (pares)
  const porModelo = new Map<string, number>();
  items.forEach((i) => porModelo.set(i.nombre, (porModelo.get(i.nombre) ?? 0) + i.cantidad));
  const top = [...porModelo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const kpis = [
    ...(todas || vende ? [
      { titulo: todas ? "Vendido hoy" : "Vendiste hoy", valor: pesos(totalHoy), detalle: `${(ventasHoy.data ?? []).length} ventas` },
      { titulo: todas ? "Vendido en el mes" : "Vendiste en el mes", valor: pesos(facturadoMes),
        detalle: todas ? `${new Set(items.map((i) => i.venta_id)).size} ventas · ${numero(paresMes)} unidades` : `${(ventasMes.data ?? []).length} ventas` },
    ] : []),
    ...(todas && veCostos ? [{ titulo: "Ganancia bruta del mes", valor: pesos(margenMes), detalle: facturadoMes ? `${Math.round((margenMes / facturadoMes) * 100)}% sobre lo vendido` : "—" }] : []),
    ...(veStock ? [{ titulo: "Stock", valor: `${numero(paresStock)} unidades`, detalle: veCostos ? `${pesos(valorStock)} a costo` : `${bajos.length} para reponer` }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Inicio</h1>
        {vende && <Link href="/admin/ventas/nueva" className="boton"><Plus size={16} /> Nueva venta</Link>}
      </div>

      {sin_permiso && <p className="flex items-center gap-2 rounded-lg border border-borde bg-white px-4 py-2.5 text-sm text-texto-2"><Lock size={16} /> Esa pantalla no está habilitada para tu rol. Si la necesitás, pedíselo a un administrador.</p>}

      {((pedidos.count ?? 0) > 0 || (seguimientos.count ?? 0) > 0) && (
        <div className="flex flex-wrap gap-3">
          {(pedidos.count ?? 0) > 0 && <Link href="/admin/pedidos" className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-alerta"><ShoppingBag size={16} /> {pedidos.count} pedido{pedidos.count === 1 ? "" : "s"} para atender <ChevronRight size={16} /></Link>}
          {(seguimientos.count ?? 0) > 0 && <Link href="/admin/seguimientos" className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-marca"><MessageCircleMore size={16} /> {seguimientos.count} seguimiento{seguimientos.count === 1 ? "" : "s"} para hoy <ChevronRight size={16} /></Link>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.titulo} className="tarjeta">
            <div className="etiqueta">{k.titulo}</div>
            <div className="text-xl font-bold md:text-2xl">{k.valor}</div>
            <div className="text-xs text-texto-2">{k.detalle}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {veStock && <section className="tarjeta">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><TriangleAlert size={17} className="text-alerta" /> Para reponer <span className="text-sm font-normal text-texto-2">({bajos.length})</span></h2>
          {bajos.length === 0 ? <p className="text-sm text-texto-2">Nada por debajo del mínimo.</p> : (
            <ul className="divide-y divide-gray-100 text-sm">
              {bajos.slice(0, 8).map((v) => (
                <li key={v.variante_id} className="flex justify-between py-2">
                  <Link href={veCostos ? `/admin/productos/${v.producto_id}` : `/admin/stock?q=${encodeURIComponent(v.nombre ?? "")}`} className="hover:underline">{v.nombre} · {v.talle} · {v.color}</Link>
                  <span className={`chip ${v.disponible === 0 ? "bg-red-100 text-error" : "bg-amber-100 text-alerta"}`}>{v.disponible === 0 ? "sin stock" : `quedan ${v.disponible}`}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {bajos.length > 8 && <Link href="/admin/stock?filtro=bajo" className="inline-flex items-center gap-1 text-sm font-semibold text-marca">Ver los {bajos.length} <ChevronRight size={15} /></Link>}
            <Link href="/admin/reposicion" className="inline-flex items-center gap-1 text-sm font-semibold text-marca">Pedido sugerido <ChevronRight size={15} /></Link>
          </div>
        </section>}

        {todas && <section className="tarjeta">
          <h2 className="mb-3 flex items-center gap-2 font-semibold"><Trophy size={17} className="text-marca" /> Más vendidos del mes</h2>
          {top.length === 0 ? <p className="text-sm text-texto-2">Todavía no hay ventas este mes.</p> : (
            <ul className="space-y-2 text-sm">
              {top.map(([nombre, pares]) => (
                <li key={nombre}>
                  <div className="flex justify-between"><span>{nombre}</span><b>{pares} unidades</b></div>
                  <div className="mt-1 h-1.5 rounded bg-gray-100"><div className="h-1.5 rounded bg-marca" style={{ width: `${(pares / top[0][1]) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>}
      </div>

      {(todas || vende) && <section className="tarjeta overflow-x-auto">
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">{todas ? "Últimas ventas" : "Tus últimas ventas"}</h2>
          <Link href="/admin/ventas" className="inline-flex items-center gap-1 text-sm font-semibold text-marca">Ver todas <ChevronRight size={15} /></Link></div>
        <div className="-mx-4 -mb-4 divide-y divide-gray-100 border-t border-gray-100 md:hidden">
          {(ultimas.data ?? []).map((v) => (
            <FilaMovil key={v.id} href={`/admin/ventas/${v.id}`} titulo={(v.clientes as unknown as { nombre: string } | null)?.nombre ?? "Sin cliente"}
              detalle={<>{fechaHora(v.fecha)} · {v.canal}</>} valor={<span className="font-bold">{pesos(v.total)}</span>} />
          ))}
        </div>
        <table className="tabla hidden md:table">
          <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Canal</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {(ultimas.data ?? []).map((v) => (
              <tr key={v.id}>
                <td><Link href={`/admin/ventas/${v.id}`} className="font-mono text-marca hover:underline">{v.comprobante}</Link></td>
                <td>{fechaHora(v.fecha)}</td>
                <td>{(v.clientes as unknown as { nombre: string } | null)?.nombre ?? "—"}</td>
                <td>{v.canal}</td>
                <td className="text-right font-semibold">{pesos(v.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>}
    </div>
  );
}
