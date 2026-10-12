// Bandeja de fallados: lo que está roto o vino mal, apartado en un depósito que no vende, hasta que se
// resuelve (se arregló, se le devuelve al proveedor o se da de baja). Muestra cuánto hay parado y, con
// "Ver costos", cuánto vale, qué se reclamó a cada proveedor y qué se perdió.
import Link from "next/link";
import { PackageX } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, inicioDe, numero, pesos } from "@/lib/formato";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import Resolver from "./Resolver";

const SALIDA: Record<string, { texto: string; color: string }> = {
  arreglado: { texto: "Se arregló", color: "bg-green-100 text-ok" },
  proveedor: { texto: "Al proveedor", color: "bg-blue-50 text-marca" },
  baja: { texto: "Baja", color: "bg-red-50 text-error" },
};

export default async function Fallados({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { permisos } = await exigir("stock.ver");
  const { ver } = await searchParams;
  const resueltos = ver === "resueltos";
  const conCostos = puede(permisos, "costos.ver");
  const resuelve = puede(permisos, "stock.ajustar");
  const supabase = await crearCliente();
  const columnas = "id, fecha, producto_id, codigo, nombre, marca, imagen_url, talle, color, cantidad, origen, venta_id, venta_comprobante, motivo, estado, nota, proveedor, proveedor_principal_id, proveedor_principal, resuelto_en, resuelto_por, cargado_por, valor_costo";
  const [{ data: pendientes }, { data: hechos }, { data: proveedores }, { data: creditos }] = await Promise.all([
    supabase.from("v_fallados").select(columnas).eq("estado", "pendiente").order("fecha", { ascending: false }),
    supabase.from("v_fallados").select(columnas).neq("estado", "pendiente").order("resuelto_en", { ascending: false }).limit(200),
    resuelve ? supabase.from("proveedores").select("id, nombre").order("nombre") : Promise.resolve({ data: [] }),
    conCostos ? supabase.from("v_credito_proveedores").select("saldo") : Promise.resolve({ data: [] }),
  ]);
  const creditoSinUsar = (creditos ?? []).reduce((s, c) => s + Number(c.saldo ?? 0), 0);
  const pend = pendientes ?? [], res = hechos ?? [];
  const unidades = pend.reduce((s, f) => s + (f.cantidad ?? 0), 0);
  const valor = pend.reduce((s, f) => s + Number(f.valor_costo ?? 0), 0);
  // Lo devuelto a cada proveedor (crédito a descontar) y lo perdido este mes
  const mes = inicioDe("mes");
  const porProveedor = new Map<string, { unidades: number; valor: number }>();
  res.filter((f) => f.estado === "proveedor").forEach((f) => {
    const g = porProveedor.get(f.proveedor ?? "") ?? { unidades: 0, valor: 0 };
    g.unidades += f.cantidad ?? 0; g.valor += Number(f.valor_costo ?? 0);
    porProveedor.set(f.proveedor ?? "", g);
  });
  const bajasMes = res.filter((f) => f.estado === "baja" && (f.resuelto_en ?? "") >= mes);
  const perdidaMes = bajasMes.reduce((s, f) => s + Number(f.valor_costo ?? 0), 0);
  const lista = resueltos ? res : pend;

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Fallados</h1>
        <p className="text-sm text-texto-2">Lo que está roto o vino mal queda apartado: no se ofrece en la tienda ni en la caja hasta que se resuelve.</p></div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="tarjeta"><div className="etiqueta">Por resolver</div><div className="text-2xl font-bold">{numero(unidades)}</div>
          <div className="text-xs text-texto-2">{unidades === 1 ? "unidad" : "unidades"} en {pend.length} {pend.length === 1 ? "tanda" : "tandas"}</div></div>
        {conCostos && <div className="tarjeta"><div className="etiqueta">Parado a costo</div><div className="text-2xl font-bold">{pesos(valor)}</div>
          <div className="text-xs text-texto-2">lo que costó lo que está en fallados</div></div>}
        {conCostos && <div className="tarjeta"><div className="etiqueta">Crédito con proveedores</div>
          <div className="text-2xl font-bold">{pesos(creditoSinUsar)}</div>
          <div className="text-xs text-texto-2">sin usar · se descuenta al cargar su factura · <Link href="/admin/proveedores" className="text-marca">ver</Link></div></div>}
        {conCostos && <div className="tarjeta"><div className="etiqueta">Pérdidas del mes</div><div className="text-2xl font-bold">{pesos(perdidaMes)}</div>
          <div className="text-xs text-texto-2">{bajasMes.reduce((s, f) => s + (f.cantidad ?? 0), 0)} dadas de baja</div></div>}
      </div>

      {conCostos && porProveedor.size > 0 && (
        <section className="tarjeta">
          <h2 className="mb-2 font-semibold">Devuelto a cada proveedor</h2>
          <ul className="divide-y divide-gray-100 text-sm">{[...porProveedor.entries()].sort((a, b) => b[1].valor - a[1].valor).map(([p, g]) => (
            <li key={p} className="flex justify-between py-2"><span>{p}</span><span><span className="text-texto-2">{g.unidades} u. · </span><b>{pesos(g.valor)}</b></span></li>
          ))}</ul>
        </section>
      )}

      <nav className="flex gap-2">
        <Link href="/admin/fallados" className={`rounded-lg border px-3 py-1.5 text-sm ${!resueltos ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>Por resolver ({pend.length})</Link>
        <Link href="/admin/fallados?ver=resueltos" className={`rounded-lg border px-3 py-1.5 text-sm ${resueltos ? "border-marca bg-marca-suave font-semibold text-marca" : "border-borde bg-white"}`}>Resueltos</Link>
      </nav>

      {lista.length === 0 ? (
        <div className="tarjeta grid place-items-center gap-2 py-10 text-center text-sm text-texto-2">
          <PackageX size={32} className="text-gray-300" />
          {resueltos ? "Todavía no se resolvió ningún fallado." : <span>No hay fallados por resolver. Para apartar algo, entrá a la <Link href="/admin/productos" className="text-marca">ficha del producto</Link> → «Mover a fallados».</span>}
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((f) => (
            <li key={f.id} className="tarjeta flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
              {f.imagen_url ? <img src={f.imagen_url} alt="" className="h-16 w-12 shrink-0 rounded-lg object-cover" /> : <span className="grid h-16 w-12 shrink-0 place-items-center rounded-lg bg-gray-100 text-gray-300"><PackageX size={20} /></span>}
              <div className="min-w-0 flex-1 basis-48 text-sm">
                <Link href={`/admin/productos/${f.producto_id}`} className="font-semibold text-marca hover:underline">{f.nombre}</Link>
                <div className="text-texto-2">Talle {f.talle} · {f.color} · <b className="text-gray-800">{f.cantidad} {f.cantidad === 1 ? "unidad" : "unidades"}</b>{conCostos && f.valor_costo != null ? ` · ${pesos(f.valor_costo)} a costo` : ""}</div>
                <div className="mt-0.5">«{f.motivo}»</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-texto-2">
                  <span className="chip bg-gray-100 text-gray-700">{f.origen === "cliente" ? "Lo devolvió un cliente" : "Encontrado en el local"}</span>
                  {f.venta_id && <Link href={`/admin/ventas/${f.venta_id}`} className="font-mono text-marca">venta {f.venta_comprobante}</Link>}
                  <span>{fecha(f.fecha ?? "")} · cargó {f.cargado_por}</span>
                  {f.estado !== "pendiente" && <>
                    <span className={`chip ${SALIDA[f.estado ?? ""]?.color}`}>{SALIDA[f.estado ?? ""]?.texto}{f.estado === "proveedor" && f.proveedor ? `: ${f.proveedor}` : ""}</span>
                    <span>{fecha(f.resuelto_en ?? "")} · {f.resuelto_por}{f.nota ? ` · «${f.nota}»` : ""}</span></>}
                </div>
              </div>
              {f.estado === "pendiente" && resuelve && (
                <Resolver id={f.id ?? 0} cantidad={f.cantidad ?? 1} titulo={`${f.nombre} · ${f.talle} · ${f.color}`}
                  proveedores={proveedores ?? []} proveedorPrincipal={f.proveedor_principal_id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
