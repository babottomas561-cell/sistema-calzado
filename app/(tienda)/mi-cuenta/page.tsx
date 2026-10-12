// Mi cuenta: mis pedidos (con su estado) y mis datos.
import Link from "next/link";
import { redirect } from "next/navigation";
import { crearCliente, usuarioActual } from "@/lib/supabase/server";
import { CircleCheck, Wallet } from "lucide-react";
import { dia, fecha, pesos } from "@/lib/formato";
import { ESTADOS } from "@/lib/estados-pedido";
import MisDatos from "./MisDatos";

async function salir() {
  "use server";
  const supabase = await crearCliente();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function MiCuenta({ searchParams }: { searchParams: Promise<{ confirmado?: string; clave?: string }> }) {
  const { confirmado, clave } = await searchParams;
  const { supabase, user } = await usuarioActual();
  if (!user) redirect("/ingresar?volver=/mi-cuenta");
  // La base solo devuelve SU ficha (v_mi_ficha, sin lo interno del CRM) y SUS pedidos (Row Level Security)
  const [{ data: ficha }, { data: pedidos }, { data: saldos }] = await Promise.all([
    supabase.from("v_mi_ficha").select("nombre, documento, telefono, email, direccion, localidad, fecha_nacimiento, acepta_promos").maybeSingle(),
    supabase.from("pedidos").select("id, comprobante, fecha, total, estado, entrega").order("fecha", { ascending: false }),
    // Su saldo a favor (de devoluciones), con lo que vence antes primero
    supabase.from("v_mi_saldo").select("id, restante, vence").order("vence"),
  ]);
  const saldo = (saldos ?? []).reduce((s, c) => s + Number(c.restante), 0);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h1 className="text-3xl font-extrabold tracking-[-0.035em]">Hola, {ficha?.nombre?.split(" ")[0] ?? "!"}</h1>
          <div className="flex items-center gap-4 text-sm font-semibold text-marca"><Link href="/nueva-clave">Cambiar contraseña</Link><form action={salir}><button>Cerrar sesión</button></form></div></div>
        {(confirmado || clave) && (
          <p className="flex items-center gap-2 rounded-sm border border-borde bg-green-50 p-3 text-sm text-ok" role="status">
            <CircleCheck size={18} /> {confirmado ? "¡Email confirmado! Tu cuenta ya está lista." : "Listo: cambiaste tu contraseña."}</p>
        )}
        {saldo > 0 && (
          <div className="flex items-start gap-3 rounded-sm border border-borde bg-marca-suave p-4">
            <Wallet size={22} className="mt-0.5 shrink-0" />
            <div><p>Tenés <b className="text-lg">{pesos(saldo)}</b> de saldo a favor para tu próxima compra en el local.</p>
              <p className="text-sm text-texto-2">{(saldos ?? []).map((c) => `${pesos(c.restante)} hasta el ${dia(c.vence)}`).join(" · ")}</p></div>
          </div>
        )}
        <h2 className="font-semibold">Mis pedidos</h2>
        {(pedidos ?? []).map((p) => (
          <Link key={p.id} href={`/mi-cuenta/pedidos/${p.id}`} className="flex items-center justify-between rounded-sm border border-borde bg-white p-4 hover:border-marca">
            <div><div className="font-semibold">Pedido <span className="font-mono">{p.comprobante}</span></div><div className="text-sm text-texto-2">{fecha(p.fecha)} · {p.entrega === "envio" ? "Envío" : "Retiro"}</div></div>
            <div className="text-right"><span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span><div className="mt-1 font-semibold">{pesos(p.total)}</div></div>
          </Link>
        ))}
        {pedidos?.length === 0 && <p className="text-texto-2">Todavía no hiciste pedidos. <Link href="/tienda" className="text-marca">Ver el catálogo</Link></p>}
      </section>
      {/* Las columnas de una vista llegan como posible null: se normalizan */}
      {ficha && <MisDatos ficha={{ ...ficha, nombre: ficha.nombre ?? "", acepta_promos: ficha.acepta_promos ?? true }} />}
    </div>
  );
}
