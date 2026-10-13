// Stock valorizado: cuánta plata hay en mercadería, a costo y a precio de venta, abierto por
// rubro, marca, modelo, talle o color. Es una foto de HOY (el stock no tiene período).
import { LINEAS, ordenEscala, rotuloTalle } from "@/lib/escalas";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { leerTodo } from "@/lib/informes";
import { numero, pesos } from "@/lib/formato";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { Agrupar, type FilaDesglose } from "../Desglose";
import { exigir } from "@/lib/exigir";
import { diaArgentina } from "@/lib/formato";

const POR = { linea: "Línea", rubro: "Rubro", marca: "Marca", modelo: "Modelo", temporada: "Temporada", genero: "Género", talle: "Talle", color: "Color" } as const;
type Por = keyof typeof POR;

export default async function StockValorizado({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const { permisos } = await exigir("informes.stock");
  // Sin "Ver costos" la base devuelve el costo vacío: se valoriza solo a precio de venta
  const conCostos = permisos.includes("costos.ver_valor_stock");
  const conVentas = permisos.includes("informes.ventas") || permisos.includes("ventas.ver_todas");
  const { por: p = "rubro" } = await searchParams;
  const por = (p in POR ? p : "rubro") as Por;
  const supabase = await crearCliente();
  // Lo fallado no está en v_stock (no se vende): se muestra aparte
  const hoy = diaArgentina();
  const restarDias = (dias: number) => { const fecha = new Date(`${hoy}T12:00:00Z`); fecha.setUTCDate(fecha.getUTCDate() - dias); return fecha.toISOString().slice(0, 10); };
  const desde90 = restarDias(89), desde30 = restarDias(29);
  const [{ data: fallados }, ventas90] = await Promise.all([
    supabase.from("v_fallados").select("cantidad, valor_costo").eq("estado", "pendiente"),
    conVentas ? leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, articulo, sku, talle, color, dia, cantidad").gte("dia", desde90).order("id").range(a, b)) : Promise.resolve([]),
  ]);
  const fall = { unidades: (fallados ?? []).reduce((s, f) => s + (f.cantidad ?? 0), 0), costo: (fallados ?? []).reduce((s, f) => s + Number(f.valor_costo ?? 0), 0) };
  const filas = await leerTodo((a, b) => supabase.from("v_stock")
    .select("variante_id, producto_id, codigo, sku, nombre, marca, categoria, talle, talle_orden, color, escala, genero, temporada, linea, stock, precio_compra, precio_venta")
    .order("variante_id").range(a, b));

  // Solo lo que hay físicamente (lo reservado en pedidos también es mercadería del local)
  const conStock = filas.map((v) => ({ ...v, stock: v.stock ?? 0, costo: Number(v.precio_compra ?? 0), venta: Number(v.precio_venta ?? 0) })).filter((v) => v.stock > 0);
  const movimiento = new Map<string, { u30: number; u90: number; ultima: string | null }>();
  const movimientoProducto = new Map<string, number>();
  for (const v of ventas90) {
    const codigo = v.sku ?? `${v.articulo}|${v.talle}|${v.color}`;
    const actual = movimiento.get(codigo) ?? { u30: 0, u90: 0, ultima: null };
    const cantidad = Number(v.cantidad ?? 0);
    actual.u90 += cantidad;
    if ((v.dia ?? "") >= desde30) actual.u30 += cantidad;
    if (cantidad > 0 && (!actual.ultima || (v.dia ?? "") > actual.ultima)) actual.ultima = v.dia;
    movimiento.set(codigo, actual);
    movimientoProducto.set(v.articulo ?? "", (movimientoProducto.get(v.articulo ?? "") ?? 0) + cantidad);
  }

  const clave = (v: (typeof conStock)[number]): [string, string, number] => {
    switch (por) {
      case "linea": return [v.linea ?? "", v.linea ?? "Sin línea", LINEAS.indexOf((v.linea ?? "") as never)];
      case "temporada": return [v.temporada ?? "", v.temporada ?? "Sin temporada", 0];
      case "genero": return [v.genero ?? "", v.genero ?? "Sin género", 0];
      case "rubro": return [v.categoria ?? "", v.categoria ?? "Sin rubro", 0];
      case "marca": return [v.marca ?? "", v.marca ?? "Sin marca", 0];
      case "modelo": return [String(v.producto_id), `${v.codigo} · ${v.nombre}`, 0];
      case "talle": return [`${v.escala}|${v.talle}`, rotuloTalle(v.talle, v.escala), ordenEscala(v.escala) * 10000 + Number(v.talle_orden)];
      case "color": return [v.color ?? "", v.color ?? "", 0];
    }
  };
  const grupos = new Map<string, { etiqueta: string; orden: number; productoId: number | null; unidades: number; costo: number; venta: number; modelos: Set<number>; variantes: Set<number>; vendidos30: number; inmovilizadas: number; costoInmovilizado: number }>();
  for (const v of conStock) {
    const [k, etiqueta, orden] = clave(v);
    const rotacion = movimiento.get(v.sku ?? `${v.codigo}|${v.talle}|${v.color}`);
    const sinVentas90 = conVentas && Math.max(0, movimientoProducto.get(v.codigo ?? "") ?? 0) === 0;
    const g = grupos.get(k) ?? { etiqueta, orden, productoId: por === "modelo" ? v.producto_id : null, unidades: 0, costo: 0, venta: 0, modelos: new Set<number>(), variantes: new Set<number>(), vendidos30: 0, inmovilizadas: 0, costoInmovilizado: 0 };
    const varianteId = v.variante_id ?? 0;
    const varianteNueva = !g.variantes.has(varianteId);
    g.unidades += v.stock; g.costo += v.stock * v.costo; g.venta += v.stock * v.venta; g.modelos.add(v.producto_id ?? 0); g.variantes.add(varianteId);
    if (varianteNueva) g.vendidos30 += Math.max(0, rotacion?.u30 ?? 0);
    if (sinVentas90) { g.inmovilizadas += v.stock; g.costoInmovilizado += v.stock * v.costo; }
    grupos.set(k, g);
  }
  // Por talle se lee en el orden de los talles; el resto, de mayor a menor plata invertida
  const lista = [...grupos.entries()].sort(([, a], [, b]) => (por === "talle" || por === "linea" ? a.orden - b.orden : conCostos ? b.costo - a.costo : b.venta - a.venta));

  const tot = { unidades: 0, costo: 0, venta: 0, vendidos30: 0, inmovilizadas: 0, costoInmovilizado: 0 };
  lista.forEach(([, g]) => { tot.unidades += g.unidades; tot.costo += g.costo; tot.venta += g.venta; tot.vendidos30 += g.vendidos30; tot.inmovilizadas += g.inmovilizadas; tot.costoInmovilizado += g.costoInmovilizado; });
  const margen = (costo: number, venta: number) => (venta > 0 ? Math.round(((venta - costo) / venta) * 100) : 0);
  const cobertura = (stock: number, vendidos30: number) => vendidos30 > 0 ? Math.round(stock * 30 / vendidos30) : null;
  const textoCobertura = (dias: number | null) => dias === null ? "Sin ventas en 30 días" : dias > 365 ? "Más de un año" : `${dias} días`;

  // Avisos: sin costo, el valor a costo queda por debajo de la realidad; sin precio de venta, la ganancia potencial
  const sinCosto = !conCostos ? [] : [...new Map(conStock.filter((v) => v.costo <= 0).map((v) => [v.producto_id, v])).values()];
  const sinPrecio = [...new Map(conStock.filter((v) => v.venta <= 0).map((v) => [v.producto_id, v])).values()];
  const inmovilizados = conVentas ? [...new Map(conStock.filter((v) => Math.max(0, movimientoProducto.get(v.codigo ?? "") ?? 0) === 0).map((v) => [v.producto_id, v])).values()] : [];

  const filasDesglose: FilaDesglose[] = lista.map(([k, g]) => ({
    clave: k,
    etiqueta: g.productoId ? <Link href={`/admin/productos/${g.productoId}`} className="text-marca hover:underline">{g.etiqueta}</Link> : g.etiqueta,
    principal: conCostos ? g.costo : g.venta,
    principalTexto: pesos(conCostos ? g.costo : g.venta),
    buscarTexto: g.etiqueta,
    ordenValores: [g.unidades, ...(conVentas ? [g.vendidos30, cobertura(g.unidades, g.vendidos30) ?? 99999] : []), ...(conCostos ? [g.costo] : []), g.venta, ...(conCostos ? [g.venta - g.costo, margen(g.costo, g.venta)] : [])],
    celdas: [numero(g.unidades), ...(conVentas ? [numero(g.vendidos30), textoCobertura(cobertura(g.unidades, g.vendidos30))] : []), ...(conCostos ? [pesos(g.costo)] : []), pesos(g.venta), ...(conCostos ? [pesos(g.venta - g.costo), `${margen(g.costo, g.venta)} %`] : [])],
    detalle: `${numero(g.unidades)} unidades${conVentas ? ` · ${numero(g.vendidos30)} vendidas en 30 días · cobertura ${textoCobertura(cobertura(g.unidades, g.vendidos30)).toLowerCase()}` : ""}${conCostos ? ` · a venta ${pesos(g.venta)} · margen ${margen(g.costo, g.venta)} %` : ""}${por !== "modelo" ? ` · ${g.modelos.size} modelo${g.modelos.size === 1 ? "" : "s"}` : ""}`,
  }));

  const kpis = [
    { titulo: "Unidades en stock", valor: numero(tot.unidades), detalle: `${new Set(conStock.map((v) => v.producto_id)).size} modelos` },
    ...(conCostos ? [{ titulo: "Valor a costo", valor: pesos(tot.costo), detalle: "lo que te costó la mercadería" }] : []),
    { titulo: "Valor a precio de venta", valor: pesos(tot.venta), detalle: "si vendieras todo a precio de lista" },
    ...(conCostos ? [{ titulo: "Ganancia potencial", valor: pesos(tot.venta - tot.costo), detalle: `${margen(tot.costo, tot.venta)} % del precio de venta` }] : []),
    ...(conVentas ? [{ titulo: "Cobertura estimada", valor: textoCobertura(cobertura(tot.unidades, tot.vendidos30)), detalle: `${numero(tot.vendidos30)} unidades vendidas en los últimos 30 días` }] : []),
    ...(conVentas ? [{ titulo: "Sin ventas hace 90 días", valor: numero(tot.inmovilizadas), detalle: `${inmovilizados.length} modelos con stock${conCostos ? ` · ${pesos(tot.costoInmovilizado)} a costo` : ""}` }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.titulo} className="tarjeta"><div className="etiqueta">{k.titulo}</div>
            <div className="text-xl font-bold tabular-nums md:text-2xl">{k.valor}</div><div className="text-xs text-texto-2">{k.detalle}</div></div>
        ))}
      </div>
      {fall.unidades > 0 && (
        <p className="text-sm text-texto-2">Aparte, hay <b>{numero(fall.unidades)} {fall.unidades === 1 ? "unidad" : "unidades"} en fallados</b>{conCostos ? ` (${pesos(fall.costo)} a costo)` : ""} que no se cuentan acá porque no están a la venta.{" "}
          <Link href="/admin/fallados" className="text-marca">Ver la bandeja</Link></p>
      )}

      {inmovilizados.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-alerta">
          <p className="flex gap-2"><TriangleAlert size={16} className="mt-0.5 shrink-0" /><span><b>Mercadería inmovilizada:</b> estos modelos tienen stock pero no registran ventas en los últimos 90 días: {inmovilizados.slice(0, 6).map((v, i) => <span key={v.producto_id}>{i > 0 ? ", " : ""}<Link href={`/admin/productos/${v.producto_id}`} className="underline">{v.nombre}</Link></span>)}{inmovilizados.length > 6 ? "…" : "."}</span></p>
        </div>
      )}

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

      <Desglose titulo={`Stock por ${POR[por].toLowerCase()}`} total={conCostos ? tot.costo : tot.venta} filas={filasDesglose}
        columnas={[POR[por], "Unidades", ...(conVentas ? ["Vendidas 30 d", "Cobertura"] : []), ...(conCostos ? ["A costo"] : []), "A venta", ...(conCostos ? ["Ganancia potencial", "Margen"] : [])]}
        acciones={<BotonCSV archivo={`stock-valorizado-por-${por}`}
          columnas={[POR[por], "Unidades", ...(conVentas ? ["Vendidas últimos 30 días", "Cobertura estimada en días"] : []), ...(conCostos ? ["Valor a costo"] : []), "Valor a venta", ...(conCostos ? ["Ganancia potencial", "Margen %"] : [])]}
          filas={lista.map(([, g]) => [g.etiqueta, g.unidades, ...(conVentas ? [g.vendidos30, cobertura(g.unidades, g.vendidos30)] : []), ...(conCostos ? [g.costo] : []), g.venta, ...(conCostos ? [g.venta - g.costo, margen(g.costo, g.venta)] : [])])} />} />

      <p className="text-xs text-texto-2">Stock de hoy. El costo es el último precio de compra de cada modelo; el precio de venta, el de lista (sin descuentos por medio de pago). La cobertura estima cuántos días duraría el stock si se mantuviera el ritmo neto de los últimos 30 días; no es un pronóstico de demanda.</p>
    </div>
  );
}
