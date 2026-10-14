// Recibo de un cobro de cuenta corriente (se imprime o se guarda como PDF desde el navegador). No es una factura.
import { notFound } from "next/navigation";
import { crearCliente } from "@/lib/supabase/server";
import { exigir } from "@/lib/exigir";
import { fechaHora, pesos } from "@/lib/formato";
import Volver from "@/components/Volver";
import BotonImprimir from "./BotonImprimir";

export default async function Recibo({ params }: { params: Promise<{ id: string }> }) {
  await exigir("cc.ver", "cc.cobrar");
  const { id } = await params;
  const supabase = await crearCliente();
  const { data: m } = await supabase.from("cc_movimientos").select("id, creado_en, cliente_id, monto, tipo, referencia, nota, medios_pago(nombre), clientes(nombre)").eq("id", Number(id)).eq("tipo", "cobro").maybeSingle();
  if (!m) notFound();
  const [{ data: tienda }, { data: legales }, { data: movs }] = await Promise.all([
    supabase.from("configuracion_tienda").select("nombre").single(),
    supabase.from("datos_legales").select("razon_social, cuit, domicilio_legal").maybeSingle(),
    supabase.from("cc_movimientos").select("monto").eq("cliente_id", m.cliente_id).lte("id", m.id),
  ]);
  const quedaDebiendo = (movs ?? []).reduce((t, x) => t + Number(x.monto), 0);   // la deuda después de este cobro
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="print:hidden flex items-center justify-between"><Volver href={`/admin/cuenta-corriente/${m.cliente_id}`}>Volver a la cuenta</Volver><BotonImprimir /></div>
      <div className="tarjeta space-y-3 print:border-0 print:shadow-none">
        <div className="text-center"><p className="text-lg font-bold">{legales?.razon_social || tienda?.nombre}</p>
          {legales?.cuit && <p className="text-xs text-texto-2">CUIT {legales.cuit}</p>}{legales?.domicilio_legal && <p className="text-xs text-texto-2">{legales.domicilio_legal}</p>}</div>
        <p className="text-center text-sm font-semibold uppercase tracking-wide">Recibo de pago · N.º {String(m.id).padStart(8, "0")}</p>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt className="text-texto-2">Fecha</dt><dd>{fechaHora(m.creado_en)}</dd></div>
          <div className="flex justify-between"><dt className="text-texto-2">Recibimos de</dt><dd className="font-medium">{(m.clientes as { nombre?: string } | null)?.nombre}</dd></div>
          <div className="flex justify-between"><dt className="text-texto-2">Forma de pago</dt><dd>{(m.medios_pago as { nombre?: string } | null)?.nombre}{m.referencia ? ` · ${m.referencia}` : ""}</dd></div>
          {m.nota && <div className="flex justify-between"><dt className="text-texto-2">Nota</dt><dd>{m.nota}</dd></div>}
        </dl>
        <p className="border-t border-borde pt-3 text-center"><span className="text-sm text-texto-2">Importe recibido</span><br /><span className="text-3xl font-bold tabular-nums">{pesos(Math.abs(Number(m.monto)))}</span></p>
        <p className="text-center text-sm text-texto-2">Saldo de la cuenta corriente después de este pago: <b className="text-texto">{pesos(quedaDebiendo)}</b></p>
        <p className="text-center text-[11px] text-texto-2">Comprobante interno: no es una factura.</p>
      </div>
    </div>
  );
}
