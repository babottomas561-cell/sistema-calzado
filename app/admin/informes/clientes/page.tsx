// Clientes: quién compró en el período, cuáles son nuevos o recurrentes y a quién conviene contactar.
import Link from "next/link";
import { MessageCircle, UserRoundPlus, UsersRound } from "lucide-react";
import { redirect } from "next/navigation";
import { exigir } from "@/lib/exigir";
import { crearCliente } from "@/lib/supabase/server";
import { diaArgentina, numero, pesos } from "@/lib/formato";
import { PERIODOS, rangoDe, type Periodo } from "@/lib/informes";
import { paraWhatsApp } from "@/lib/telefono";
import BotonCSV from "@/components/BotonCSV";
import Desglose, { type FilaDesglose } from "../Desglose";
import SelectorPeriodo from "../SelectorPeriodo";

const plural = (n: number, uno: string, varios: string) => `${numero(n)} ${n === 1 ? uno : varios}`;
const diasDesde = (fecha: string, hoy: string) => Math.max(0, Math.floor((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${fecha}T12:00:00Z`)) / 86_400_000));

export default async function InformeClientes({ searchParams }: { searchParams: Promise<{ periodo?: string; desde?: string; hasta?: string }> }) {
  // La base exige los dos permisos (ventas por cliente y fichas de clientes): con uno solo no hay informe
  const { permisos } = await exigir("informes.ventas", "clientes.ver");
  if (!permisos.includes("informes.ventas") || !permisos.includes("clientes.ver")) redirect("/admin?sin_permiso=1");
  const sp = await searchParams;
  const periodo = (sp.periodo && sp.periodo in PERIODOS ? sp.periodo : "mes") as Periodo;
  const hoy = diaArgentina();
  const rango = rangoDe(periodo, hoy, sp.desde, sp.hasta);
  const supabase = await crearCliente();
  const { data, error } = await supabase.rpc("informe_clientes", { p_desde: rango.desde, p_hasta: rango.hasta });
  if (error) throw new Error(error.message);
  const todos = data ?? [];
  const activos = todos.filter((c) => Number(c.compras_periodo) > 0);
  const nuevos = activos.filter((c) => (c.primera_compra ?? "") >= rango.desde);
  const recurrentes = activos.filter((c) => (c.primera_compra ?? "") < rango.desde);
  const vendido = activos.reduce((s, c) => s + Number(c.vendido_periodo), 0);
  const compras = activos.reduce((s, c) => s + Number(c.compras_periodo), 0);
  const unidades = activos.reduce((s, c) => s + Number(c.unidades_periodo), 0);
  const paraContactar = todos.filter((c) => c.ultima_compra && diasDesde(c.ultima_compra, hoy) >= 60).sort((a, b) => (a.ultima_compra ?? "").localeCompare(b.ultima_compra ?? ""));

  const filas: FilaDesglose[] = activos.map((c) => {
    const ticket = Number(c.compras_periodo) ? Number(c.vendido_periodo) / Number(c.compras_periodo) : 0;
    return {
      clave: String(c.cliente_id), buscarTexto: `${c.codigo} ${c.nombre}`, principal: Number(c.vendido_periodo), principalTexto: pesos(c.vendido_periodo),
      etiqueta: <Link href={`/admin/clientes/${c.cliente_id}`} className="text-marca hover:underline"><span className="font-mono text-xs text-texto-2">{c.codigo}</span> · {c.nombre}</Link>,
      ordenValores: [Number(c.compras_periodo), Number(c.unidades_periodo), Number(c.vendido_periodo), ticket],
      celdas: [numero(c.compras_periodo), numero(c.unidades_periodo), pesos(c.vendido_periodo), pesos(ticket)],
      detalle: `${plural(Number(c.compras_periodo), "compra", "compras")} · ${plural(Number(c.unidades_periodo), "unidad", "unidades")} · ticket ${pesos(ticket)}${(c.primera_compra ?? "") >= rango.desde ? " · cliente nuevo" : ""}`,
    };
  });

  return <div className="space-y-4">
    <SelectorPeriodo base="/admin/informes/clientes" periodo={periodo} rango={rango} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className="tarjeta"><div className="etiqueta">Clientes que compraron</div><div className="text-xl font-bold md:text-2xl">{numero(activos.length)}</div><div className="text-xs text-texto-2">{plural(compras, "compra", "compras")}</div></div>
      <div className="tarjeta"><div className="etiqueta">Clientes nuevos</div><div className="text-xl font-bold md:text-2xl">{numero(nuevos.length)}</div><div className="text-xs text-texto-2">su primera compra fue en el período</div></div>
      <div className="tarjeta"><div className="etiqueta">Clientes recurrentes</div><div className="text-xl font-bold md:text-2xl">{numero(recurrentes.length)}</div><div className="text-xs text-texto-2">ya habían comprado antes</div></div>
      <div className="tarjeta"><div className="etiqueta">Cobrado a clientes</div><div className="text-xl font-bold md:text-2xl">{pesos(vendido)}</div><div className="text-xs text-texto-2">{plural(unidades, "unidad identificada", "unidades identificadas")}</div></div>
      <div className="tarjeta"><div className="etiqueta">Ticket promedio</div><div className="text-xl font-bold md:text-2xl">{pesos(compras ? vendido / compras : 0)}</div><div className="text-xs text-texto-2">por compra identificada</div></div>
    </div>

    {activos.length > 0 ? <section className="tarjeta space-y-2">
      <div className="flex items-center justify-between text-sm"><span className="inline-flex items-center gap-2 font-semibold"><UsersRound size={17} className="text-marca" /> Composición de clientes</span><span className="text-texto-2">{plural(nuevos.length, "nuevo", "nuevos")} · {plural(recurrentes.length, "recurrente", "recurrentes")}</span></div>
      <div className="flex h-3 overflow-hidden rounded-full bg-gray-100" title={`${nuevos.length} nuevos y ${recurrentes.length} recurrentes`}><div className="bg-marca" style={{ width: `${nuevos.length / activos.length * 100}%` }} /><div className="bg-blue-200" style={{ width: `${recurrentes.length / activos.length * 100}%` }} /></div>
    </section> : null}

    <Desglose titulo="Clientes que compraron" total={vendido} filas={filas} columnas={["Cliente", "Compras", "Unidades", "Cobrado", "Ticket promedio"]}
      acciones={<BotonCSV archivo={`clientes-${rango.desde}-al-${rango.hasta}`} columnas={["Código", "Cliente", "Compras", "Unidades", "Cobrado", "Ticket promedio", "Primera compra", "Última compra"]}
        filas={activos.map((c) => [c.codigo, c.nombre, c.compras_periodo, c.unidades_periodo, c.vendido_periodo, Number(c.compras_periodo) ? Number(c.vendido_periodo) / Number(c.compras_periodo) : 0, c.primera_compra, c.ultima_compra])} />} />

    <section className="tarjeta p-0">
      <div className="flex items-center gap-2 px-4 py-3"><UserRoundPlus size={17} className="text-alerta" /><h2 className="font-semibold">Para volver a contactar <span className="text-sm font-normal text-texto-2">({paraContactar.length})</span></h2></div>
      <ul className="divide-y divide-gray-100 border-t border-gray-100">
        {paraContactar.slice(0, 20).map((c) => <li key={c.cliente_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"><span><Link href={`/admin/clientes/${c.cliente_id}`} className="font-semibold text-marca hover:underline">{c.nombre}</Link><span className="ml-2 text-texto-2">última compra hace {diasDesde(c.ultima_compra!, hoy)} días · {plural(Number(c.compras_total), "compra histórica", "compras históricas")}</span></span>{paraWhatsApp(c.telefono) ? <a href={`https://wa.me/${paraWhatsApp(c.telefono)}`} target="_blank" rel="noopener noreferrer" className="boton-sec py-1.5"><MessageCircle size={15} /> WhatsApp</a> : null}</li>)}
        {paraContactar.length === 0 ? <li className="px-4 py-8 text-center text-sm text-texto-2">No hay clientes con más de 60 días desde su última compra.</li> : null}
      </ul>
    </section>
    <p className="text-xs text-texto-2">Este informe cuenta ventas asociadas a una ficha de cliente (lo cobrado, con descuentos y recargos de los medios de pago). Las ventas sin cliente y las anuladas no entran; las devoluciones no se descuentan. “Para contactar” significa 60 días o más desde su última compra; es una sugerencia comercial, no un envío automático.</p>
  </div>;
}
