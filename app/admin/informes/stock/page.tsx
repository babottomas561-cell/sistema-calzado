// Stock valorizado: cuánta plata hay en mercadería, a costo y a precio de venta, abierto por
// rubro, marca, modelo, talle o color. Es una foto de HOY (el stock no tiene período).
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { leerTodo } from "@/lib/informes";
import { numero, pesos } from "@/lib/formato";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { Agrupar, type FilaDesglose } from "../Desglose";

const POR = { rubro: "Rubro", marca: "Marca", modelo: "Modelo", talle: "Talle", color: "Color" } as const;
type Por = keyof typeof POR;

export default async function StockValorizado({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const { por: p = "rubro" } = await searchParams;
  const por = (p in POR ? p : "rubro") as Por;
  const supabase = await crearCliente();
  const filas = await leerTodo((a, b) => supabase.from("v_stock")
    .select("variante_id, producto_id, codigo, nombre, marca, categoria, talle, talle_orden, color, stock, precio_compra, precio_venta")
    .order("variante_id").range(a, b));

  // Solo lo que hay físicamente (lo reservado en pedidos también es mercadería del local)
  const conStock = filas.map((v) => ({ ...v, stock: v.stock ?? 0, costo: Number(v.precio_compra ?? 0), venta: Number(v.precio_venta ?? 0) })).filter((v) => v.stock > 0);

  const clave = (v: (typeof conStock)[number]): [string, string, number] => {
    switch (por) {
      case "rubro": return [v.categoria ?? "", v.categoria ?? "Sin rubro", 0];
      case "marca": return [v.marca ?? "", v.marca ?? "Sin marca", 0];
      case "modelo": return [String(v.producto_id), `${v.codigo} · ${v.nombre}`, 0];
      case "talle": return [v.talle ?? "", v.talle ?? "", Number(v.talle_orden)];
      case "color": return [v.color ?? "", v.color ?? "", 0];
    }
  };
  const grupos = new Map<string, { etiqueta: string; orden: number; productoId: number | null; pares: number; costo: number; venta: number; modelos: Set<number> }>();
  for (const v of conStock) {
    const [k, etiqueta, orden] = clave(v);
    const g = grupos.get(k) ?? { etiqueta, orden, productoId: por === "modelo" ? v.producto_id : null, pares: 0, costo: 0, venta: 0, modelos: new Set<number>() };
    g.pares += v.stock; g.costo += v.stock * v.costo; g.venta += v.stock * v.venta; g.modelos.add(v.producto_id ?? 0);
    grupos.set(k, g);
  }
  // Por talle se lee en el orden de los talles; el resto, de mayor a menor plata invertida
  const lista = [...grupos.entries()].sort(([, a], [, b]) => (por === "talle" ? a.orden - b.orden : b.costo - a.costo));

  const tot = { pares: 0, costo: 0, venta: 0 };
  lista.forEach(([, g]) => { tot.pares += g.pares; tot.costo += g.costo; tot.venta += g.venta; });
  const margen = (costo: number, venta: number) => (venta > 0 ? Math.round(((venta - costo) / venta) * 100) : 0);

  // Avisos: sin costo, el valor a costo queda por debajo de la realidad; sin precio de venta, la ganancia potencial
  const sinCosto = [...new Map(conStock.filter((v) => v.costo <= 0).map((v) => [v.producto_id, v])).values()];
  const sinPrecio = [...new Map(conStock.filter((v) => v.venta <= 0).map((v) => [v.producto_id, v])).values()];

  const filasDesglose: FilaDesglose[] = lista.map(([k, g]) => ({
    clave: k,
    etiqueta: g.productoId ? <Link href={`/admin/productos/${g.productoId}`} className="text-marca hover:underline">{g.etiqueta}</Link> : g.etiqueta,
    principal: g.costo,
    principalTexto: pesos(g.costo),
    celdas: [numero(g.pares), pesos(g.costo), pesos(g.venta), pesos(g.venta - g.costo), `${margen(g.costo, g.venta)} %`],
    detalle: `${numero(g.pares)} pares · a venta ${pesos(g.venta)} · margen ${margen(g.costo, g.venta)} %${por !== "modelo" ? ` · ${g.modelos.size} modelo${g.modelos.size === 1 ? "" : "s"}` : ""}`,
  }));

  const kpis = [
    { titulo: "Pares en stock", valor: numero(tot.pares), detalle: `${new Set(conStock.map((v) => v.producto_id)).size} modelos` },
    { titulo: "Valor a costo", valor: pesos(tot.costo), detalle: "lo que te costó la mercadería" },
    { titulo: "Valor a precio de venta", valor: pesos(tot.venta), detalle: "si vendieras todo a precio de lista" },
    { titulo: "Ganancia potencial", valor: pesos(tot.venta - tot.costo), detalle: `${margen(tot.costo, tot.venta)} % del precio de venta` },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.titulo} className="tarjeta"><div className="etiqueta">{k.titulo}</div>
            <div className="text-xl font-bold tabular-nums md:text-2xl">{k.valor}</div><div className="text-xs text-texto-2">{k.detalle}</div></div>
        ))}
      </div>

      {(sinCosto.length > 0 || sinPrecio.length > 0) && (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-alerta">
          {sinCosto.length > 0 && <p className="flex gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" /><span>
            <b>{sinCosto.length} modelo{sinCosto.length === 1 ? "" : "s"} con stock y sin precio de compra</b> (el valor a costo está por debajo de lo real):{" "}
            {sinCosto.slice(0, 5).map((v, i) => <span key={v.producto_id}>{i > 0 && ", "}<Link href={`/admin/productos/${v.producto_id}`} className="underline">{v.nombre}</Link></span>)}{sinCosto.length > 5 && "…"}</span></p>}
          {sinPrecio.length > 0 && <p className="flex gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" /><span>
            <b>{sinPrecio.length} modelo{sinPrecio.length === 1 ? "" : "s"} con stock y sin precio de venta</b>:{" "}
            {sinPrecio.slice(0, 5).map((v, i) => <span key={v.producto_id}>{i > 0 && ", "}<Link href={`/admin/productos/${v.producto_id}`} className="underline">{v.nombre}</Link></span>)}{sinPrecio.length > 5 && "…"}</span></p>}
        </div>
      )}

      <Agrupar base="/admin/informes/stock" opciones={POR} actual={por} />

      <Desglose titulo={`Stock por ${POR[por].toLowerCase()}`} total={tot.costo} filas={filasDesglose}
        columnas={[POR[por], "Pares", "A costo", "A venta", "Ganancia potencial", "Margen"]}
        acciones={<BotonCSV archivo={`stock-valorizado-por-${por}`}
          columnas={[POR[por], "Pares", "Valor a costo", "Valor a venta", "Ganancia potencial", "Margen %"]}
          filas={lista.map(([, g]) => [g.etiqueta, g.pares, g.costo, g.venta, g.venta - g.costo, margen(g.costo, g.venta)])} />} />

      <p className="text-xs text-texto-2">Stock de hoy. El costo es el último precio de compra de cada modelo; el precio de venta, el de lista (sin descuentos por medio de pago). La barra muestra la parte de la plata invertida a costo.</p>
    </div>
  );
}
