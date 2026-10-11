// CRM: listado de clientes con lo que compraron.
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { fecha, pesos } from "@/lib/formato";
import { Plus } from "lucide-react";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ q?: string; etiqueta?: string }> }) {
  const { q = "", etiqueta = "" } = await searchParams;
  const supabase = await crearCliente();
  let consulta = supabase.from("clientes")
    .select("id, codigo, nombre, telefono, email, origen, etiquetas, usuario_id, ventas(total, fecha)").order("nombre");
  if (q) {
    const b = q.replace(/[%,()]/g, "");
    consulta = /^\d+$/.test(b) && b.length <= 6 ? consulta.eq("codigo", Number(b))   // búsqueda por código de cliente
      : consulta.or(`nombre.ilike.%${b}%,telefono.ilike.%${b}%,documento.ilike.%${b}%`);
  }
  if (etiqueta) consulta = consulta.contains("etiquetas", [etiqueta]);
  const { data: clientes, error } = await consulta;
  const todas = [...new Set((clientes ?? []).flatMap((c) => c.etiquetas))].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Link href="/admin/clientes/nuevo" className="boton"><Plus size={16} /> Nuevo cliente</Link>
      </div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar por código, nombre, teléfono o documento…" className="campo" /><button className="boton-sec">Buscar</button></form>
      {todas.length > 0 && <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/clientes" className={`chip ${!etiqueta ? "bg-marca text-white" : "bg-gray-100"}`}>todas</Link>
        {todas.map((e) => <Link key={e} href={`/admin/clientes?etiqueta=${encodeURIComponent(e)}`} className={`chip ${e === etiqueta ? "bg-marca text-white" : "bg-gray-100"}`}>#{e}</Link>)}
      </div>}
      {error && <p className="text-error">{error.message}</p>}
      <div className="tarjeta overflow-x-auto p-0">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Cliente</th><th>Contacto</th><th>Origen</th><th className="text-right">Compras</th><th className="text-right">Total comprado</th><th>Última</th></tr></thead>
          <tbody>
            {(clientes ?? []).map((c) => {
              const ventas = c.ventas as { total: number; fecha: string }[];
              const ultima = ventas.map((v) => v.fecha).sort().at(-1);
              return (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.codigo}</td>
                  <td><Link href={`/admin/clientes/${c.id}`} className="font-semibold text-marca hover:underline">{c.nombre}</Link>
                    {c.usuario_id && <span className="chip ml-2 bg-blue-50 text-marca">cuenta web</span>}
                    <div className="text-xs text-texto-2">{c.etiquetas.map((e) => `#${e}`).join(" ")}</div></td>
                  <td className="text-sm">{c.telefono ?? ""}<div className="text-xs text-texto-2">{c.email ?? ""}</div></td>
                  <td>{c.origen ?? "—"}</td>
                  <td className="text-right">{ventas.length}</td>
                  <td className="text-right font-semibold">{pesos(ventas.reduce((s, v) => s + Number(v.total), 0))}</td>
                  <td>{ultima ? fecha(ultima) : "—"}</td>
                </tr>
              );
            })}
            {clientes?.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-texto-2">No hay clientes.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
