// Comprobante de devolución: qué volvió, en qué estado, y el saldo a favor que dejó (con su vencimiento).
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, Wallet } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";
import { dia, fechaHora, pesos } from "@/lib/formato";
import { exigir } from "@/lib/exigir";
import { ESTADOS_DEVUELTO, MOTIVOS_DEVOLUCION } from "@/lib/devoluciones";
import Volver from "@/components/Volver";

export default async function ComprobanteDevolucion({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  await exigir("ventas.registrar", "ventas.ver_todas", "clientes.ver");
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  const supabase = await crearCliente();
  const [{ data: d }, { data: items }, { data: credito }] = await Promise.all([
    supabase.from("devoluciones").select("*, ventas(id, comprobante, fecha), clientes(id, nombre), hizo:perfiles(nombre)").eq("id", Number(id)).single(),
    supabase.from("devolucion_items").select("id, cantidad, estado, monto, venta_items(precio_unitario, variantes(talles(nombre), colores(nombre), productos(nombre)))").eq("devolucion_id", Number(id)),
    supabase.from("v_creditos").select("monto, restante, vence").eq("devolucion_id", Number(id)).maybeSingle(),
  ]);
  if (!d) notFound();
  const venta = d.ventas as { id: number; comprobante: string; fecha: string };
  const cliente = d.clientes as { id: number; nombre: string };
  type Item = { id: number; cantidad: number; estado: string; monto: number; venta_items: { precio_unitario: number; variantes: { talles: { nombre: string }; colores: { nombre: string }; productos: { nombre: string } } } };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      {nueva && <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm font-semibold text-ok"><CircleCheck size={18} /> Devolución registrada. El stock ya volvió.</div>}
      <Volver href={`/admin/ventas/${venta.id}`}>Venta {venta.comprobante}</Volver>
      <div className="tarjeta space-y-4">
        <div className="flex justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-texto-2">Comprobante de devolución</p>
            <h1 className="text-xl font-bold"><span className="font-mono">{d.comprobante}</span></h1>
            <p className="text-sm text-texto-2">{fechaHora(d.fecha)}{(d.hizo as { nombre: string | null } | null)?.nombre ? ` · la hizo ${(d.hizo as { nombre: string }).nombre}` : ""}</p></div>
          <div className="text-right text-sm"><Link href={`/admin/clientes/${cliente.id}`} className="font-semibold text-marca">{cliente.nombre}</Link>
            <div className="text-texto-2">de la venta <Link href={`/admin/ventas/${venta.id}`} className="font-mono text-marca">{venta.comprobante}</Link></div></div>
        </div>
        <p className="text-sm"><b>{MOTIVOS_DEVOLUCION[d.motivo]}</b>{d.comentario ? ` · «${d.comentario}»` : ""}
          {d.fuera_de_plazo && <span className="chip ml-2 bg-amber-100 text-alerta">fuera de plazo</span>}</p>
        <table className="tabla">
          <thead><tr><th>Producto</th><th className="text-right">Cant.</th><th>Estado</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>{((items ?? []) as unknown as Item[]).map((i) => {
            const v = i.venta_items.variantes;
            return <tr key={i.id}><td>{v.productos.nombre}<div className="text-xs text-texto-2">Talle {v.talles.nombre} · {v.colores.nombre}</div></td>
              <td className="text-right">{i.cantidad}</td>
              <td><span className={`chip ${i.estado === "fallado" ? "bg-amber-100 text-alerta" : "bg-green-100 text-ok"}`}>{ESTADOS_DEVUELTO[i.estado as "bueno" | "fallado"]}</span></td>
              <td className="text-right">{pesos(i.monto)}</td></tr>;
          })}</tbody>
        </table>
        <div className="flex items-start gap-3 rounded-lg bg-marca-suave p-3 text-sm">
          <Wallet size={20} className="mt-0.5 shrink-0 text-marca" />
          {Number(d.total) > 0
            ? <div><p>Saldo a favor: <b className="text-lg">{pesos(d.total)}</b>{credito?.vence ? <>, para usar hasta el <b>{dia(credito.vence)}</b></> : null}.</p>
                {credito && Number(credito.restante) < Number(credito.monto) && <p className="text-xs text-texto-2">Ya usó {pesos(Number(credito.monto) - Number(credito.restante))}; le quedan {pesos(credito.restante)}.</p>}
                <p className="text-xs text-texto-2">Se usa al cobrar, con el medio de pago «Saldo a favor».</p></div>
            : <p>No deja saldo a favor: lo que se queda vale lo mismo que pagó.</p>}
        </div>
        <p className="text-xs text-texto-2">Comprobante interno, sin validez fiscal.</p>
      </div>
    </div>
  );
}
