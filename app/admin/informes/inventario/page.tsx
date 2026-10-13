// Reponer y liquidar: cruza el stock con lo que se vende. Arriba, lo que se está quedando sin stock (o sin talles) y rota bien: hay que reponer.
// Abajo, lo que no se mueve: hay que liquidarlo. Es una foto de HOY con las ventas de los últimos 30 y 90 días.
import Link from "next/link";
import { PackageSearch, TrendingDown } from "lucide-react";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { leerTodo } from "@/lib/informes";
import { rotuloTalle } from "@/lib/escalas";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { type FilaDesglose } from "../Desglose";

const DIAS_REPONER = 30, DIAS_PLAN = 45, DIAS_LENTO = 180;
const dias = (n: number | null) => (n === null ? "Sin ventas" : n > 365 ? "Más de un año" : `${n} días`);

export default async function ReponerYLiquidar() {
  const { permisos } = await exigir("informes.stock");
  if (!permisos.includes("informes.ventas") && !permisos.includes("ventas.ver_todas")) return <p className="tarjeta text-sm text-texto-2">Este informe cruza el stock con las ventas: necesita también el permiso «Ventas por período».</p>;
  const conCostos = permisos.includes("costos.ver_valor_stock"), veProductos = permisos.includes("costos.ver_precio_compra"), puedeComprar = permisos.includes("compras.registrar");
  const supabase = await crearCliente();
  const hoy = diaArgentina();
  const restar = (n: number) => { const f = new Date(`${hoy}T12:00:00Z`); f.setUTCDate(f.getUTCDate() - n); return f.toISOString().slice(0, 10); };
  const desde30 = restar(29), desde90 = restar(89);
  const [filas, ventas] = await Promise.all([
    leerTodo((a, b) => supabase.from("v_stock").select("variante_id, producto_id, codigo, sku, nombre, talle, talle_orden, color, escala, disponible, stock, precio_venta, valor_costo").order("variante_id").range(a, b)),
    leerTodo((a, b) => supabase.from("v_hechos_ventas").select("id, sku, articulo, talle, color, dia, cantidad").gte("dia", desde90).order("id").range(a, b)),
  ]);

  // Ventas netas de cada variante (por sku) y de cada modelo (por código de artículo): las devoluciones restan
  const porVariante = new Map<string, { u30: number; u90: number; ultima: string | null }>();
  const porModelo = new Map<string, { u30: number; u90: number; ultima: string | null }>();
  const sumar = (m: typeof porVariante, k: string, dia: string, n: number) => {
    const a = m.get(k) ?? { u30: 0, u90: 0, ultima: null };
    a.u90 += n; if (dia >= desde30) a.u30 += n; if (n > 0 && (!a.ultima || dia > a.ultima)) a.ultima = dia;
    m.set(k, a);
  };
  for (const v of ventas) {
    const dia = v.dia ?? "", n = Number(v.cantidad ?? 0);
    sumar(porVariante, v.sku ?? `${v.articulo}|${v.talle}|${v.color}`, dia, n);
    sumar(porModelo, v.articulo ?? "", dia, n);
  }

  type M = { id: number; codigo: string; nombre: string; disponible: number; stock: number; valorVenta: number; valorCosto: number; agotados: string[] };
  const modelos = new Map<number, M>();
  for (const f of filas) {
    const m = modelos.get(f.producto_id ?? 0) ?? { id: f.producto_id ?? 0, codigo: f.codigo ?? "", nombre: f.nombre ?? "", disponible: 0, stock: 0, valorVenta: 0, valorCosto: 0, agotados: [] };
    const disp = Math.max(0, f.disponible ?? 0), stock = Math.max(0, f.stock ?? 0);
    m.disponible += disp; m.stock += stock; m.valorVenta += stock * Number(f.precio_venta ?? 0); m.valorCosto += Number(f.valor_costo ?? 0);
    // Un talle/color que se vendió en estos 90 días y hoy no tiene stock: se está perdiendo la venta
    const rot = porVariante.get(f.sku ?? `${f.codigo}|${f.talle}|${f.color}`);
    if (rot && rot.u90 > 0 && disp <= 0) m.agotados.push(`${rotuloTalle(f.talle, f.escala)} ${f.color}`);
    modelos.set(m.id, m);
  }

  const lista = [...modelos.values()].map((m) => {
    const r = porModelo.get(m.codigo) ?? { u30: 0, u90: 0, ultima: null };
    const u30 = Math.max(0, r.u30), u90 = Math.max(0, r.u90);
    return { ...m, u30, u90, ultima: r.ultima, cobertura: u30 > 0 ? Math.round((m.disponible * 30) / u30) : null, sugerido: u30 > 0 ? Math.max(0, Math.ceil((u30 * DIAS_PLAN) / 30) - m.disponible) : 0 };
  });
  const reponer = lista.filter((m) => m.u30 > 0 && ((m.cobertura ?? 0) <= DIAS_REPONER || m.agotados.length > 0))
    .sort((a, b) => (a.cobertura ?? 0) - (b.cobertura ?? 0) || b.agotados.length - a.agotados.length);
  const liquidar = lista.filter((m) => m.stock > 0 && m.u90 === 0).sort((a, b) => b.valorVenta - a.valorVenta);
  const lentos = lista.filter((m) => m.stock >= 6 && m.u90 > 0 && (m.cobertura === null || m.cobertura > DIAS_LENTO) && m.cobertura !== null || (m.stock >= 6 && m.u90 > 0 && m.u30 === 0)).filter((m) => !liquidar.includes(m)).sort((a, b) => b.valorVenta - a.valorVenta);
  const agotadosTotal = reponer.reduce((s, m) => s + m.agotados.length, 0);
  const inmovilVenta = liquidar.reduce((s, m) => s + m.valorVenta, 0), inmovilCosto = liquidar.reduce((s, m) => s + m.valorCosto, 0);

  const nombre = (m: { id: number; codigo: string; nombre: string }) => (veProductos ? <Link href={`/admin/productos/${m.id}`} className="text-marca hover:underline"><span className="font-mono text-xs text-texto-2">{m.codigo}</span> · {m.nombre}</Link> : `${m.codigo} · ${m.nombre}`);
  const filasReponer: FilaDesglose[] = reponer.map((m) => ({
    clave: String(m.id), etiqueta: nombre(m), buscarTexto: `${m.codigo} ${m.nombre}`, principal: m.u30, principalTexto: `${numero(m.u30)} en 30 días`,
    ordenValores: [m.disponible, m.u30, m.cobertura ?? 99999, m.agotados.length, m.sugerido],
    celdas: [numero(m.disponible), numero(m.u30), dias(m.cobertura), m.agotados.length ? m.agotados.slice(0, 4).join(" · ") + (m.agotados.length > 4 ? ` y ${m.agotados.length - 4} más` : "") : "—", numero(m.sugerido)],
    detalle: `${numero(m.disponible)} disponibles · se vendieron ${numero(m.u30)} en 30 días · alcanza para ${dias(m.cobertura).toLowerCase()}${m.agotados.length ? ` · sin stock: ${m.agotados.slice(0, 3).join(", ")}` : ""} · sugerido ${numero(m.sugerido)}`,
  }));
  const filasLiquidar = (lista: typeof liquidar): FilaDesglose[] => lista.map((m) => ({
    clave: String(m.id), etiqueta: nombre(m), buscarTexto: `${m.codigo} ${m.nombre}`, principal: m.valorVenta, principalTexto: pesos(m.valorVenta),
    ordenValores: [m.stock, m.u90, m.valorVenta, ...(conCostos ? [m.valorCosto] : [])],
    celdas: [numero(m.stock), m.ultima ? `hace ${Math.max(0, Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${m.ultima}T12:00:00Z`)) / 86400000))} días` : "Más de 90 días", pesos(m.valorVenta), ...(conCostos ? [pesos(m.valorCosto)] : [])],
    detalle: `${numero(m.stock)} unidades · ${m.u90 === 0 ? "sin ventas en 90 días" : `vendió ${numero(m.u90)} en 90 días`} · a precio de venta ${pesos(m.valorVenta)}${conCostos ? ` · a costo ${pesos(m.valorCosto)}` : ""}`,
  }));
  const colsLiquidar = ["Modelo", "Unidades", "Última venta", "A precio de venta", ...(conCostos ? ["A costo"] : [])];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Para reponer</div><div className="text-xl font-bold tabular-nums">{numero(reponer.length)}</div><div className="text-xs text-texto-2">modelos que rotan y se quedan sin stock</div></div>
        <div className="tarjeta"><div className="etiqueta">Talles agotados</div><div className="text-xl font-bold tabular-nums">{numero(agotadosTotal)}</div><div className="text-xs text-texto-2">se vendían y hoy no hay</div></div>
        <div className="tarjeta"><div className="etiqueta">Para liquidar</div><div className="text-xl font-bold tabular-nums">{numero(liquidar.length)}</div><div className="text-xs text-texto-2">modelos sin ventas en 90 días</div></div>
        <div className="tarjeta"><div className="etiqueta">Plata parada</div><div className="text-xl font-bold tabular-nums">{pesos(conCostos ? inmovilCosto : inmovilVenta)}</div><div className="text-xs text-texto-2">{conCostos ? "a costo" : "a precio de venta"} en lo que no se mueve</div></div>
      </div>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold"><PackageSearch size={18} className="text-marca" /> Para reponer</h2>
        <p className="text-sm text-texto-2">Se vendió en los últimos 30 días y le quedan {DIAS_REPONER} días de stock o menos (o le faltan talles que se vendían). «Sugerido» es lo que falta para cubrir {DIAS_PLAN} días al ritmo actual.{puedeComprar && <> El detalle por talle está en <Link href="/admin/reposicion" className="text-marca">Reposición</Link>.</>}</p>
        {reponer.length ? <Desglose titulo="Modelos a reponer" total={reponer.reduce((s, m) => s + m.u30, 0)} filas={filasReponer} columnas={["Modelo", "Disponible", "Vendidas en 30 días", "Alcanza para", "Talles agotados", "Sugerido"]}
          acciones={<BotonCSV archivo={`reponer-${hoy}`} columnas={["Código", "Modelo", "Disponible", "Vendidas en 30 días", "Cobertura (días)", "Talles agotados", "Sugerido"]} filas={reponer.map((m) => [m.codigo, m.nombre, m.disponible, m.u30, m.cobertura, m.agotados.join(" · "), m.sugerido])} />} />
          : <p className="tarjeta py-6 text-center text-sm text-texto-2">Nada urgente: lo que se vende tiene stock para más de {DIAS_REPONER} días.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 font-semibold"><TrendingDown size={18} className="text-alerta" /> Para liquidar</h2>
        <p className="text-sm text-texto-2">Con stock y sin ninguna venta en 90 días. Ordenado por lo que vale a precio de venta: ahí está la plata parada. Una promoción o un precio de liquidación los pone a rotar.{" "}<Link href="/admin/promociones" className="text-marca">Armar una promoción</Link></p>
        {liquidar.length ? <Desglose titulo="Sin ventas en 90 días" total={inmovilVenta} filas={filasLiquidar(liquidar)} columnas={colsLiquidar}
          acciones={<BotonCSV archivo={`liquidar-${hoy}`} columnas={["Código", "Modelo", "Unidades", "A precio de venta", ...(conCostos ? ["A costo"] : [])]} filas={liquidar.map((m) => [m.codigo, m.nombre, m.stock, m.valorVenta, ...(conCostos ? [m.valorCosto] : [])])} />} />
          : <p className="tarjeta py-6 text-center text-sm text-texto-2">Todo lo que tenés en stock se vendió en los últimos 90 días.</p>}
      </section>

      {lentos.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Rotan despacio</h2>
          <p className="text-sm text-texto-2">Se venden, pero el stock actual les alcanza para más de {DIAS_LENTO} días (o no se vendieron este último mes): no conviene reponerlos.</p>
          <Desglose titulo="Mucho stock para lo que rotan" total={lentos.reduce((s, m) => s + m.valorVenta, 0)} filas={filasLiquidar(lentos)} columnas={colsLiquidar} />
        </section>
      )}
      <p className="text-xs text-texto-2">Calculado con las ventas netas (las devoluciones restan) y el stock disponible de hoy. Lo fallado y lo que está en depósitos que no venden no cuenta.</p>
    </div>
  );
}
