// Stock completo por variante, con filtros y valorización a costo.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { numero, pesos } from "@/lib/formato";

const FILTROS = { todo: "Todo", bajo: "Para reponer", sin: "Sin stock" } as const;

export default async function Stock({ searchParams }: { searchParams: Promise<{ filtro?: string; q?: string }> }) {
  const { filtro: f = "todo", q = "" } = await searchParams;
  const filtro = (f in FILTROS ? f : "todo") as keyof typeof FILTROS;
  const supabase = await crearCliente();
  let consulta = supabase.from("v_stock").select("*").order("nombre").order("color").order("talle");
  if (filtro === "bajo") consulta = consulta.eq("stock_bajo", true);
  if (filtro === "sin") consulta = consulta.lte("disponible", 0);
  if (q) { const b = q.replace(/[%,()]/g, ""); consulta = consulta.or(`nombre.ilike.%${b}%,sku.ilike.${b}%`); }
  const { data: filas, error } = await consulta;
  const lista = (filas ?? []).map((v) => ({ ...v, stock: v.stock ?? 0, disponible: v.disponible ?? 0 }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stock</h1>
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(FILTROS).map(([k, t]) => (
          <Link key={k} href={`/admin/stock?filtro=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-lg border px-3 py-1.5 text-sm ${k === filtro ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{t}</Link>
        ))}
        <form className="ml-auto flex gap-2"><input type="hidden" name="filtro" value={filtro} /><input name="q" defaultValue={q} placeholder="Modelo o código…" className="campo py-1.5" /></form>
      </div>
      {error && <p className="text-error">{error.message}</p>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div className="tarjeta"><div className="etiqueta">Pares</div><div className="text-xl font-bold">{numero(lista.reduce((s, v) => s + v.stock, 0))}</div></div>
        <div className="tarjeta"><div className="etiqueta">Valor a costo</div><div className="text-xl font-bold">{pesos(lista.reduce((s, v) => s + Number(v.valor_costo), 0))}</div></div>
        <div className="tarjeta"><div className="etiqueta">Valor a precio de venta</div><div className="text-xl font-bold">{pesos(lista.reduce((s, v) => s + v.stock * Number(v.precio_venta), 0))}</div></div>
      </div>
      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead><tr><th>Modelo</th><th>Talle</th><th>Color</th><th>Código</th><th className="text-right">Stock</th><th className="text-right">Reservado</th><th className="text-right">Disponible</th><th className="text-right">Mínimo</th></tr></thead>
          <tbody>
            {lista.map((v) => (
              <tr key={v.variante_id}>
                <td><Link href={`/admin/productos/${v.producto_id}`} className="text-marca hover:underline">{v.nombre}</Link></td>
                <td>{v.talle}</td><td>{v.color}</td><td className="text-texto-2">{v.sku ?? "—"}</td>
                <td className="text-right">{v.stock}</td>
                <td className="text-right text-texto-2">{v.reservado || ""}</td>
                <td className="text-right"><span className={`chip ${v.disponible === 0 ? "bg-red-100 text-error" : v.stock_bajo ? "bg-amber-100 text-alerta" : "bg-gray-100"}`}>{v.disponible}</span></td>
                <td className="text-right text-texto-2">{v.stock_minimo}</td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-texto-2">Nada para mostrar.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
