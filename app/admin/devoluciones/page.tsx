// Devoluciones del período: cuántas, cuánto saldo dejaron, por qué y en qué talles (si un modelo vuelve
// mucho «por talle», conviene avisarlo en la ficha: «calza chico»).
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fechaHora, inicioDe, pesos } from "@/lib/formato";
import { exigir } from "@/lib/exigir";
import { MOTIVOS_DEVOLUCION } from "@/lib/devoluciones";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";

const PERIODOS = { mes: "Este mes", todo: "Todo" } as const;

export default async function Devoluciones({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await exigir("ventas.registrar", "ventas.ver_todas");
  const { periodo: p = "mes" } = await searchParams;
  const periodo = (p in PERIODOS ? p : "mes") as keyof typeof PERIODOS;
  const supabase = await crearCliente();
  let c = supabase.from("devoluciones").select("id, comprobante, fecha, motivo, total, fuera_de_plazo, clientes(nombre), ventas!devoluciones_venta_id_fkey(comprobante), devolucion_items(cantidad, estado, venta_items(variantes(talles(nombre), productos(id, nombre))))")
    .order("fecha", { ascending: false }).limit(500);
  if (periodo === "mes") c = c.gte("fecha", inicioDe("mes"));
  const { data } = await c;
  type Dev = { id: number; comprobante: string; fecha: string; motivo: string; total: number; fuera_de_plazo: boolean; clientes: { nombre: string } | null;
    ventas: { comprobante: string } | null; devolucion_items: { cantidad: number; estado: string; venta_items: { variantes: { talles: { nombre: string }; productos: { id: number; nombre: string } } } }[] };
  const lista = (data ?? []) as unknown as Dev[];
  const unidades = (d: Dev) => d.devolucion_items.reduce((s, i) => s + i.cantidad, 0);
  const total = lista.reduce((s, d) => s + Number(d.total), 0);
  const porMotivo = new Map<string, number>();
  lista.forEach((d) => porMotivo.set(d.motivo, (porMotivo.get(d.motivo) ?? 0) + unidades(d)));
  // Modelos que más vuelven por talle (y en qué talles)
  const porModelo = new Map<number, { nombre: string; unidades: number; talles: Map<string, number> }>();
  lista.filter((d) => d.motivo === "talle").forEach((d) => d.devolucion_items.forEach((i) => {
    const pr = i.venta_items.variantes.productos;
    const g = porModelo.get(pr.id) ?? { nombre: pr.nombre, unidades: 0, talles: new Map() };
    g.unidades += i.cantidad;
    g.talles.set(i.venta_items.variantes.talles.nombre, (g.talles.get(i.venta_items.variantes.talles.nombre) ?? 0) + i.cantidad);
    porModelo.set(pr.id, g);
  }));
  const fallados = lista.reduce((s, d) => s + d.devolucion_items.filter((i) => i.estado === "fallado").reduce((t, i) => t + i.cantidad, 0), 0);

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Devoluciones</h1>
        <p className="text-sm text-texto-2">Cada devolución deja saldo a favor y resta en los informes el día en que se hace. Se hacen desde la venta.</p></div>
      <div className="flex gap-2">
        {Object.entries(PERIODOS).map(([k, t]) => (
          <Link key={k} href={`/admin/devoluciones?periodo=${k}`} className={`rounded-lg border px-3 py-1.5 text-sm ${k === periodo ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>{t}</Link>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Devoluciones</div><div className="text-2xl font-bold">{lista.length}</div>
          <div className="text-xs text-texto-2">{lista.reduce((s, d) => s + unidades(d), 0)} unidades</div></div>
        <div className="tarjeta"><div className="etiqueta">Saldo a favor dado</div><div className="text-2xl font-bold">{pesos(total)}</div></div>
        <div className="tarjeta"><div className="etiqueta">Volvieron fallados</div><div className="text-2xl font-bold">{fallados}</div>
          <div className="text-xs text-texto-2"><Link href="/admin/fallados" className="text-marca">ver la bandeja</Link></div></div>
        <div className="tarjeta"><div className="etiqueta">Fuera de plazo</div><div className="text-2xl font-bold">{lista.filter((d) => d.fuera_de_plazo).length}</div></div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tarjeta"><h2 className="mb-2 font-semibold">Por qué vuelven</h2>
          {porMotivo.size === 0 ? <p className="text-sm text-texto-2">Sin devoluciones en este período.</p> :
            <ul className="space-y-1.5 text-sm">{[...porMotivo.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => (
              <li key={m} className="flex justify-between"><span>{MOTIVOS_DEVOLUCION[m]}</span><b>{n} u.</b></li>))}</ul>}
        </section>
        <section className="tarjeta"><h2 className="mb-2 font-semibold">Vuelven por el talle</h2>
          {porModelo.size === 0 ? <p className="text-sm text-texto-2">Ningún modelo volvió por el talle.</p> :
            <ul className="space-y-2 text-sm">{[...porModelo.entries()].sort((a, b) => b[1].unidades - a[1].unidades).slice(0, 8).map(([pid, g]) => (
              <li key={pid}><div className="flex justify-between"><Link href={`/admin/productos/${pid}`} className="text-marca">{g.nombre}</Link><b>{g.unidades} u.</b></div>
                <div className="text-xs text-texto-2">talles {[...g.talles.entries()].map(([t, n]) => `${t} (${n})`).join(" · ")}</div></li>))}</ul>}
        </section>
      </div>

      <ListaMovil vacio={lista.length === 0 && "No hay devoluciones en este período."}>
        {lista.map((d) => (
          <FilaMovil key={d.id} href={`/admin/devoluciones/${d.id}`} titulo={d.clientes?.nombre ?? "—"}
            detalle={<>{fechaHora(d.fecha)} · <span className="font-mono">{d.comprobante}</span> · venta {d.ventas?.comprobante}</>}
            extra={<><span className="chip bg-gray-100">{MOTIVOS_DEVOLUCION[d.motivo]}</span>{d.fuera_de_plazo && <span className="chip bg-amber-100 text-alerta">fuera de plazo</span>}</>}
            valor={<><div className="font-bold">{pesos(d.total)}</div><div className="text-xs text-texto-2">{unidades(d)} u.</div></>} />
        ))}
      </ListaMovil>
      <div className="tarjeta hidden overflow-x-auto p-0 md:block">
        <table className="tabla">
          <thead><tr><th>Comprobante</th><th>Fecha</th><th>Cliente</th><th>Venta</th><th>Motivo</th><th className="text-right">Unidades</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {lista.map((d) => (
              <tr key={d.id}><td><Link href={`/admin/devoluciones/${d.id}`} className="font-mono font-semibold text-marca">{d.comprobante}</Link></td>
                <td>{fechaHora(d.fecha)}</td><td>{d.clientes?.nombre}</td><td className="font-mono text-texto-2">{d.ventas?.comprobante}</td>
                <td>{MOTIVOS_DEVOLUCION[d.motivo]}{d.fuera_de_plazo && <span className="chip ml-1 bg-amber-100 text-alerta">fuera de plazo</span>}</td>
                <td className="text-right">{unidades(d)}</td><td className="text-right font-semibold">{pesos(d.total)}</td></tr>
            ))}
            {lista.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-texto-2">No hay devoluciones en este período.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
