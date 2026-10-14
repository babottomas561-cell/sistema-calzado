// La cuenta de un cliente: cuánto debe, su tope, el historial y lo que se puede hacer (cobrar, ajustar, habilitar).
import Link from "next/link";
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { puede } from "@/lib/permisos";
import { fechaHora, pesos } from "@/lib/formato";
import Volver from "@/components/Volver";
import Operaciones from "./Operaciones";

const TIPO: Record<string, string> = { venta: "Venta a cuenta", cobro: "Cobro", anulacion: "Venta anulada", ajuste: "Ajuste" };

export default async function CuentaDeCliente({ params }: { params: Promise<{ id: string }> }) {
  const { permisos } = await exigir("cc.ver", "cc.cobrar", "cc.habilitar");
  const { id } = await params;
  const supabase = await crearCliente();
  const [{ data: cliente }, { data: movs }, { data: medios }] = await Promise.all([
    supabase.from("clientes").select("id, nombre, telefono, cc_habilitada, cc_tope").eq("id", Number(id)).maybeSingle(),
    supabase.from("cc_movimientos").select("id, creado_en, tipo, monto, nota, referencia, venta_id, ventas(comprobante), medios_pago(nombre)").eq("cliente_id", Number(id)).order("id", { ascending: false }).limit(200),
    supabase.from("medios_pago").select("id, nombre").eq("activo", true).eq("en_mostrador", true).eq("es_saldo", false).eq("es_cuenta_corriente", false).order("orden"),
  ]);
  if (!cliente) notFound();
  const saldo = (movs ?? []).reduce((t, m) => t + Number(m.monto), 0);   // hasta 200 movimientos; el saldo exacto lo da la base en la caja
  const ver = puede(permisos, "cc.ver");
  return (
    <div className="space-y-5">
      <Volver href="/admin/cuenta-corriente">Cuenta corriente</Volver>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{cliente.nombre}</h1>
          <p className="text-sm text-texto-2">{cliente.cc_habilitada ? `Puede deber hasta ${pesos(cliente.cc_tope)}` : "Todavía no tiene cuenta corriente habilitada"}
            {cliente.telefono ? ` · ${cliente.telefono}` : ""} · <Link href={`/admin/clientes/${cliente.id}`} className="font-medium text-marca">ver ficha</Link></p></div>
        {ver && <div className="text-right"><p className="text-xs text-texto-2">Debe</p><p className={`text-2xl font-bold tabular-nums ${saldo > 0.005 ? "text-error" : ""}`}>{pesos(saldo)}</p></div>}
      </div>
      <Operaciones cliente={cliente.id} habilitada={cliente.cc_habilitada} tope={Number(cliente.cc_tope)} deuda={Math.max(saldo, 0)} medios={medios ?? []}
        puedeCobrar={puede(permisos, "cc.cobrar")} puedeHabilitar={puede(permisos, "cc.habilitar")} />
      {ver && (
        <div className="tarjeta overflow-x-auto p-0">
          <table className="tabla">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Detalle</th><th className="text-right">Importe</th></tr></thead>
            <tbody>
              {(movs ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{fechaHora(m.creado_en)}</td>
                  <td>{m.tipo === "cobro" ? <Link href={`/admin/cuenta-corriente/recibo/${m.id}`} className="font-medium text-marca">Cobro · recibo</Link> : TIPO[m.tipo]}</td>
                  <td className="text-texto-2">{[(m.ventas as { comprobante?: string | null } | null)?.comprobante ? `Venta ${(m.ventas as { comprobante: string }).comprobante}` : null, (m.medios_pago as { nombre?: string } | null)?.nombre, m.referencia, m.nota].filter(Boolean).join(" · ")}</td>
                  <td className={`text-right font-medium tabular-nums ${Number(m.monto) < 0 ? "text-ok" : ""}`}>{pesos(m.monto)}</td>
                </tr>
              ))}
              {(movs ?? []).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-texto-2">Sin movimientos.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
