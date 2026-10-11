// Mi cuenta: mis pedidos (con su estado) y mis datos.
import Link from "next/link";
import { redirect } from "next/navigation";
import { crearCliente, usuarioActual } from "@/lib/supabase/server";
import { fecha, pesos } from "@/lib/formato";
import { ESTADOS } from "@/lib/estados-pedido";
import MisDatos from "./MisDatos";

async function salir() {
  "use server";
  const supabase = await crearCliente();
  await supabase.auth.signOut();
  redirect("/");
}

export default async function MiCuenta() {
  const { supabase, user } = await usuarioActual();
  if (!user) redirect("/ingresar?volver=/mi-cuenta");
  // La base solo devuelve SU ficha y SUS pedidos (Row Level Security)
  const [{ data: ficha }, { data: pedidos }] = await Promise.all([
    supabase.from("clientes").select("nombre, documento, telefono, email, direccion, localidad, fecha_nacimiento, acepta_promos").eq("usuario_id", user.id).maybeSingle(),
    supabase.from("pedidos").select("id, comprobante, fecha, total, estado, entrega").order("fecha", { ascending: false }),
  ]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Hola, {ficha?.nombre?.split(" ")[0] ?? "!"}</h1>
          <form action={salir}><button className="text-sm font-semibold text-marca">Cerrar sesión</button></form></div>
        <h2 className="font-semibold">Mis pedidos</h2>
        {(pedidos ?? []).map((p) => (
          <Link key={p.id} href={`/mi-cuenta/pedidos/${p.id}`} className="flex items-center justify-between rounded-xl border border-borde bg-white p-4 hover:border-marca">
            <div><div className="font-semibold">Pedido <span className="font-mono">{p.comprobante}</span></div><div className="text-sm text-texto-2">{fecha(p.fecha)} · {p.entrega === "envio" ? "Envío" : "Retiro"}</div></div>
            <div className="text-right"><span className={`chip ${ESTADOS[p.estado].color}`}>{ESTADOS[p.estado].texto}</span><div className="mt-1 font-semibold">{pesos(p.total)}</div></div>
          </Link>
        ))}
        {pedidos?.length === 0 && <p className="text-texto-2">Todavía no hiciste pedidos. <Link href="/" className="text-marca">Ver el catálogo</Link></p>}
      </section>
      {ficha && <MisDatos ficha={ficha} />}
    </div>
  );
}
