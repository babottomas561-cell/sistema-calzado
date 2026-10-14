// Qué falta antes de hacer algo (vender, facturar, cobrar online, publicar la tienda, mandar mails). Lo calcula la base (requisitos()) según la
// configuración y quién mira: lo que frena sale en rojo, lo que solo conviene arreglar en ámbar, y se dice si esa persona lo puede arreglar.
import Link from "next/link";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { crearCliente } from "@/lib/supabase/server";

export type Requisito = { clave: string; bloquea: boolean; mensaje: string; ruta: string; permiso: string; puede: boolean };
export const ACCIONES = {
  vender: "Para vender", facturar: "Para facturar", cobrar_online: "Para cobrar online", publicar_tienda: "Para publicar la tienda", enviar_mails: "Para mandar mails",
} as const;
export type Accion = keyof typeof ACCIONES;

export async function leerRequisitos(accion: Accion): Promise<Requisito[]> {
  const supabase = await crearCliente();
  const { data } = await supabase.rpc("requisitos", { p_accion: accion });
  return (data as unknown as Requisito[] | null) ?? [];
}

export function ListaRequisitos({ items }: { items: Requisito[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((r) => (
        <li key={r.clave} className={`flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-lg p-2.5 text-sm ${r.bloquea ? "bg-red-50 text-error" : "bg-amber-50 text-alerta"}`}>
          {r.bloquea ? <CircleAlert size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
          <span className="min-w-0 flex-1">{r.mensaje}</span>
          {r.puede ? <Link href={r.ruta} className="shrink-0 font-semibold underline">Resolver</Link> : <span className="shrink-0 text-xs">Pedíselo a quien administra</span>}
        </li>
      ))}
    </ul>
  );
}

// El cartel de una pantalla: no muestra nada si no falta nada
export default async function Requisitos({ accion }: { accion: Accion }) {
  const items = await leerRequisitos(accion);
  if (!items.length) return null;
  return (
    <div className="space-y-1.5" role="status">
      <p className="text-xs font-semibold text-texto-2">{ACCIONES[accion]} falta:</p>
      <ListaRequisitos items={items} />
    </div>
  );
}
