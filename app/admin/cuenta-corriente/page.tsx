// Cuenta corriente: quién debe y cuánto, y la entrada para habilitar a un cliente. Solo con el módulo encendido (Equipo → Módulos).
import Link from "next/link";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { fecha, pesos } from "@/lib/formato";
import ListaMovil, { FilaMovil } from "@/components/ListaMovil";

export default async function CuentaCorriente({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { permisos } = await exigir("cc.ver", "cc.cobrar", "cc.habilitar");
  const { q = "" } = await searchParams;
  const supabase = await crearCliente();
  const { data: modulo } = await supabase.from("modulos").select("activo").eq("clave", "cuenta-corriente").maybeSingle();
  if (modulo && !modulo.activo) {
    return <div className="space-y-2"><h1 className="text-2xl font-bold">Cuenta corriente</h1>
      <p className="text-texto-2">Esta parte está apagada. Se enciende en <Link href="/admin/equipo/modulos" className="font-medium text-marca">Equipo → Módulos</Link>.</p></div>;
  }
  const b = q.replace(/[%,()]/g, "");
  const [{ data: saldos }, { data: buscados }] = await Promise.all([
    supabase.from("v_cc_saldos").select("cliente_id, nombre, cc_habilitada, cc_tope, saldo, ultimo_movimiento").order("saldo", { ascending: false }),
    b ? supabase.from("clientes").select("id, nombre, telefono, cc_habilitada").or(`nombre.ilike.%${b}%,telefono.ilike.%${b}%,documento.ilike.%${b}%`).order("nombre").limit(8) : Promise.resolve({ data: [] }),
  ]);
  const deben = (saldos ?? []).filter((s) => Number(s.saldo) > 0.005);
  const total = deben.reduce((t, s) => t + Number(s.saldo), 0);
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Cuenta corriente</h1>
        <p className="text-sm text-texto-2">Los clientes habilitados pueden comprar a cuenta y pagar después, hasta su tope.</p></div>
      <div className="tarjeta"><p className="text-sm text-texto-2">Total que te deben</p><p className="text-2xl font-bold tabular-nums">{pesos(total)}</p>
        <p className="text-xs text-texto-2">{deben.length} {deben.length === 1 ? "cliente" : "clientes"} con deuda</p></div>
      <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Buscar un cliente para ver o habilitar su cuenta…" className="campo" /><button className="boton-sec">Buscar</button></form>
      {b && (
        <div className="tarjeta space-y-1">
          <p className="text-xs font-semibold text-texto-2">Resultado de la búsqueda</p>
          {(buscados ?? []).length === 0 ? <p className="text-sm text-texto-2">No hay clientes con eso.</p> : (buscados ?? []).map((c) => (
            <Link key={c.id} href={`/admin/cuenta-corriente/${c.id}`} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-gray-50">
              <span className="font-medium">{c.nombre}{c.telefono ? <span className="font-normal text-texto-2"> · {c.telefono}</span> : null}</span>
              <span className={`chip ${c.cc_habilitada ? "bg-green-50 text-ok" : "bg-gray-100 text-texto-2"}`}>{c.cc_habilitada ? "habilitada" : "sin cuenta"}</span>
            </Link>))}
        </div>
      )}
      <ListaMovil vacio={(saldos ?? []).length === 0 && "Todavía no hay cuentas. Buscá un cliente y habilitale la cuenta corriente."}>
        {(saldos ?? []).map((s) => (
          <FilaMovil key={s.cliente_id} href={`/admin/cuenta-corriente/${s.cliente_id}`} titulo={s.nombre ?? "Sin nombre"}
            detalle={s.cc_habilitada ? `Tope ${pesos(s.cc_tope)}${s.ultimo_movimiento ? ` · último movimiento ${fecha(s.ultimo_movimiento)}` : ""}` : "Cuenta deshabilitada"}
            valor={<div className={`font-bold tabular-nums ${Number(s.saldo) > 0.005 ? "text-error" : ""}`}>{pesos(s.saldo)}</div>} />
        ))}
      </ListaMovil>
      {!permisos.includes("cc.ver") && <p className="text-xs text-texto-2">No tenés permiso para ver el detalle de las cuentas.</p>}
    </div>
  );
}
