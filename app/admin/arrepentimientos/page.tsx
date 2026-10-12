// Arrepentimientos: las solicitudes del botón de la tienda (compras online, 10 días). Hay que contestarlas y, si
// corresponde, cancelar el pedido y devolver el dinero. Lo ve quien atiende pedidos web.
import Link from "next/link";
import { exigir } from "@/lib/exigir";
import { fechaHora } from "@/lib/formato";
import Resolver from "./Resolver";

export default async function Arrepentimientos() {
  const { supabase } = await exigir("pedidos.gestionar");
  const { data } = await supabase.from("arrepentimientos")
    .select("id, codigo, nombre, email, telefono, comprobante, pedido_id, detalle, estado, resolucion, creado_en, resuelto_en").order("creado_en", { ascending: false }).limit(100);
  const lista = data ?? [];
  const pendientes = lista.filter((a) => a.estado === "recibido");
  return (
    <div className="max-w-4xl space-y-5">
      <div><h1 className="text-2xl font-bold">Arrepentimientos</h1>
        <p className="text-sm text-texto-2">Solicitudes del botón de arrepentimiento de la tienda. El cliente tiene 10 días para revocar una compra online; contestale pronto y, si corresponde, cancelá el pedido para devolver el dinero.</p></div>
      {lista.length === 0 && <p className="tarjeta text-sm text-texto-2">Todavía no hay solicitudes.</p>}
      {pendientes.length > 0 && <p className="text-sm font-semibold text-alerta">{pendientes.length} para contestar</p>}
      <ul className="space-y-3">
        {lista.map((a) => (
          <li key={a.id} className="tarjeta space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono font-bold">{a.codigo}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${a.estado === "recibido" ? "bg-amber-50 text-alerta" : a.estado === "resuelto" ? "bg-green-50 text-ok" : "bg-gray-100 text-texto-2"}`}>
                {a.estado === "recibido" ? "Para contestar" : a.estado === "resuelto" ? "Resuelto" : "Rechazado"}</span>
            </div>
            <p className="text-sm"><b>{a.nombre}</b> · {a.email}{a.telefono ? ` · ${a.telefono}` : ""} · {fechaHora(a.creado_en)}</p>
            <p className="text-sm text-texto-2">
              {a.pedido_id ? <>Pedido <Link href={`/admin/pedidos/${a.pedido_id}`} className="font-semibold text-marca">{a.comprobante}</Link> (coincide con su email)</>
                : a.comprobante ? <>Dijo que es el pedido «{a.comprobante}», pero <b>no coincide con ninguno suyo</b>: verificalo.</> : "No indicó el n.º de pedido."}
            </p>
            {a.detalle && <p className="rounded-lg bg-gray-50 p-3 text-sm">{a.detalle}</p>}
            {a.estado === "recibido" ? <Resolver id={a.id} /> : a.resolucion && <p className="text-sm text-texto-2">Respuesta: {a.resolucion}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
