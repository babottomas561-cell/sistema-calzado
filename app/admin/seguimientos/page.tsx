// Seguimientos: la agenda con los clientes. Qué quedó para hacer con cada uno (avisarle que entró su talle, mandarle una promo, llamarlo por un reclamo)
// y los cumpleaños de la semana. Cada cosa tiene WhatsApp a un toque, «Hecho» y «Posponer»; arriba se carga uno nuevo sin salir.
import { exigir } from "@/lib/exigir";
import { diaArgentina } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import Agenda, { type Pendiente, type Cumple } from "./Agenda";

export default async function Seguimientos() {
  const { supabase, permisos, nombre } = await exigir("clientes.ver");
  const hoy = diaArgentina();
  const [{ data: pendientes }, { data: clientes }, { data: tienda }] = await Promise.all([
    supabase.from("interacciones").select("id, cliente_id, proxima_accion, proxima_fecha, detalle, canal, clientes(nombre, telefono)")
      .eq("hecha", false).not("proxima_accion", "is", null).order("proxima_fecha", { nullsFirst: false }).limit(500),
    supabase.from("clientes").select("id, nombre, telefono, fecha_nacimiento").order("nombre"),
    supabase.from("configuracion_tienda").select("nombre").maybeSingle(),
  ]);
  // Cumpleaños de los próximos 7 días (mes-día)
  const proximos = Array.from({ length: 7 }, (_, i) => diaArgentina(i).slice(5, 10));
  const cumples: Cumple[] = (clientes ?? []).filter((c) => c.fecha_nacimiento && proximos.includes(String(c.fecha_nacimiento).slice(5, 10)))
    .map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono, dia: String(c.fecha_nacimiento).slice(5, 10), hoy: String(c.fecha_nacimiento).slice(5, 10) === hoy.slice(5, 10) }))
    .sort((a, b) => proximos.indexOf(a.dia) - proximos.indexOf(b.dia));
  const lista: Pendiente[] = (pendientes ?? []).map((p) => {
    const c = p.clientes as unknown as { nombre: string; telefono: string | null };
    return { id: p.id, cliente_id: p.cliente_id, cliente: c?.nombre ?? "—", telefono: c?.telefono ?? null, accion: p.proxima_accion ?? "", fecha: p.proxima_fecha, nota: p.detalle !== p.proxima_accion ? p.detalle : null, canal: p.canal };
  });
  return <Agenda pendientes={lista} cumples={cumples} hoy={hoy} clientes={(clientes ?? []).map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }))}
    puedeEditar={puede(permisos, "clientes.editar")} tienda={tienda?.nombre ?? "el local"} quien={(nombre ?? "").split(" ")[0] || null} />;
}
