// Bitácora: quién cambió qué y cuándo (permisos, personas, módulos, configuración, precios masivos y anulaciones). Solo se lee: nada se edita ni se borra.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { exigir } from "@/lib/exigir";
import Volver from "@/components/Volver";
import { fechaHora } from "@/lib/formato";

const POR_PAGINA = 40;
const MODULOS: Record<string, string> = { equipo: "Equipo y permisos", ventas: "Ventas", stock: "Stock", tienda: "Tienda online", impresion: "Impresión", integraciones: "Integraciones", gastos: "Gastos", contabilidad: "Contabilidad", precios: "Precios" };
type Json = Record<string, unknown> | null;
const valor = (v: unknown) => (v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default async function Bitacora({ searchParams }: { searchParams: Promise<{ modulo?: string; quien?: string; desde?: string; hasta?: string; pagina?: string }> }) {
  const { modulo, quien, desde, hasta, pagina } = await searchParams;
  const { supabase } = await exigir("bitacora.ver");
  const n = Math.max(1, Number(pagina) || 1);
  let consulta = supabase.from("bitacora").select("id, fecha, usuario_nombre, modulo, accion, detalle, antes, despues", { count: "exact" }).order("id", { ascending: false }).range((n - 1) * POR_PAGINA, n * POR_PAGINA - 1);
  if (modulo && MODULOS[modulo]) consulta = consulta.eq("modulo", modulo);
  if (quien?.trim()) consulta = consulta.ilike("usuario_nombre", `%${quien.trim().replace(/[%_]/g, "")}%`);
  if (desde) consulta = consulta.gte("fecha", `${desde}T00:00:00-03:00`);
  if (hasta) consulta = consulta.lte("fecha", `${hasta}T23:59:59-03:00`);
  const { data, count } = await consulta;
  const paginas = Math.max(1, Math.ceil((count ?? 0) / POR_PAGINA));
  const enlace = (p: number) => `?${new URLSearchParams({ ...(modulo ? { modulo } : {}), ...(quien ? { quien } : {}), ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}), pagina: String(p) })}`;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="space-y-2">
        <Volver href="/admin/equipo">Equipo</Volver>
        <h1 className="text-2xl font-bold">Bitácora</h1>
        <p className="text-sm text-texto-2">Quién cambió qué y cuándo. Se guarda para siempre en la base de este local y no se puede editar ni borrar. Las claves de las integraciones nunca se guardan: solo se anota que cambiaron.</p>
      </div>
      <form className="tarjeta grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end">
        <div><label className="etiqueta">Parte del sistema</label>
          <select name="modulo" defaultValue={modulo ?? ""} className="campo"><option value="">Todas</option>{Object.entries(MODULOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label className="etiqueta">Persona</label><input name="quien" defaultValue={quien ?? ""} className="campo" placeholder="Nombre o email" /></div>
        <div><label className="etiqueta">Desde</label><input type="date" name="desde" defaultValue={desde ?? ""} className="campo" /></div>
        <div><label className="etiqueta">Hasta</label><input type="date" name="hasta" defaultValue={hasta ?? ""} className="campo" /></div>
        <button className="boton">Filtrar</button>
      </form>

      <ul className="tarjeta divide-y divide-gray-100 p-0">
        {(data ?? []).map((r) => {
          const antes = r.antes as Json, despues = r.despues as Json;
          const campos = [...new Set([...Object.keys(antes ?? {}), ...Object.keys(despues ?? {})])];
          return (
            <li key={r.id} className="px-4 py-3">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs tabular-nums text-texto-2">{fechaHora(r.fecha)}</span>
                  <span className="rounded-full bg-marca-suave px-2 py-0.5 text-xs font-semibold text-marca">{MODULOS[r.modulo] ?? r.modulo}</span>
                  <span className="min-w-0 flex-1 font-medium">{r.detalle}</span>
                  <span className="text-sm text-texto-2">{r.usuario_nombre}</span>
                </summary>
                {campos.length > 0 && (
                  <table className="tabla mt-2 text-sm"><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead>
                    <tbody>{campos.map((c) => <tr key={c}><td className="font-mono text-xs">{c}</td><td className="break-all text-texto-2">{valor(antes?.[c])}</td><td className="break-all">{valor(despues?.[c])}</td></tr>)}</tbody></table>
                )}
              </details>
            </li>
          );
        })}
        {!(data ?? []).length && <li className="px-4 py-10 text-center text-sm text-texto-2">No hay cambios registrados con ese filtro.</li>}
      </ul>

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          {n > 1 ? <Link href={enlace(n - 1)} className="boton-sec"><ChevronLeft size={16} /> Más nuevos</Link> : <span />}
          <span className="text-texto-2">Página {n} de {paginas} · {count} registros</span>
          {n < paginas ? <Link href={enlace(n + 1)} className="boton-sec">Más viejos <ChevronRight size={16} /></Link> : <span />}
        </div>
      )}
    </div>
  );
}
