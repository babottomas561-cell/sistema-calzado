// Pedidos de la tienda y de otros canales, ordenados por lo que hay que hacer: atender (pendientes y confirmados), preparar, entregar y cerrados.
// Cada pedido dice cuánto hace que espera, si ya pagó y cómo se entrega; lo simple (confirmar, preparar) se hace desde la lista.
import { exigir } from "@/lib/exigir";
import ListaPedidos, { type FilaPedido } from "./ListaPedidos";

const GRUPOS = {
  atender: ["pendiente", "confirmado"], preparar: ["preparado"], entregar: ["enviado", "listo_retiro"], cerrados: ["entregado", "cancelado"],
} as const;
type Grupo = keyof typeof GRUPOS;

export default async function Pedidos({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { supabase } = await exigir("pedidos.gestionar");
  const { ver } = await searchParams;
  const [{ data: activos, error }, { data: cerrados }, { data: tienda }] = await Promise.all([
    supabase.from("pedidos").select("id, comprobante, fecha, total, costo_envio, estado, canal, entrega, direccion_envio, pagado_online, clientes(nombre, telefono), medios_pago(nombre)")
      .in("estado", ["pendiente", "confirmado", "preparado", "enviado", "listo_retiro"]).order("fecha", { ascending: true }).limit(500),
    supabase.from("pedidos").select("id, comprobante, fecha, total, costo_envio, estado, canal, entrega, direccion_envio, pagado_online, clientes(nombre, telefono), medios_pago(nombre)")
      .in("estado", ["entregado", "cancelado"]).order("fecha", { ascending: false }).limit(150),
    supabase.from("configuracion_tienda").select("nombre").maybeSingle(),
  ]);
  const aFila = (p: NonNullable<typeof activos>[number]): FilaPedido => {
    const c = p.clientes as unknown as { nombre: string; telefono: string | null } | null;
    return { id: p.id, comprobante: p.comprobante ?? "", fecha: p.fecha, total: Number(p.total) + Number(p.costo_envio ?? 0), estado: p.estado, canal: p.canal, envio: p.entrega === "envio",
      direccion: p.direccion_envio, pagado: !!p.pagado_online, cliente: c?.nombre ?? "—", telefono: c?.telefono ?? null, medio: (p.medios_pago as unknown as { nombre: string } | null)?.nombre ?? "" };
  };
  const filas = [...(activos ?? []), ...(cerrados ?? [])].map(aFila);
  const inicial: Grupo = ver && ver in GRUPOS ? (ver as Grupo) : (["atender", "preparar", "entregar"] as Grupo[]).find((g) => filas.some((f) => (GRUPOS[g] as readonly string[]).includes(f.estado))) ?? "atender";
  return (
    <div className="space-y-4">
      {error && <p className="text-error">{error.message}</p>}
      <ListaPedidos filas={filas} grupos={GRUPOS} inicial={inicial} tienda={tienda?.nombre ?? "el local"} />
    </div>
  );
}
